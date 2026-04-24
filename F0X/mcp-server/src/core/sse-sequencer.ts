/**
 * SSE delivery reliability: sequence numbers + client-side reconciliation.
 *
 * SSE is an inherently best-effort transport (TCP reconnects, proxy buffering,
 * load-balancer timeouts). Without sequence tracking the client cannot detect
 * missed events or know what to catch up on after a reconnect.
 *
 * This module provides:
 *   1. A client-side sequence tracker that records the last seen sequence
 *      number per channel.
 *   2. A reconciliation helper that, on reconnect, fetches messages since the
 *      last seen sequence and replays them into the handler.
 *   3. Alerting for sequence gaps (consecutive missed events).
 *
 * ARCHITECTURE NOTE:
 *   The relay must include a monotonically increasing `seq` field on every
 *   SSE event. The client stores `lastSeenSeq` and submits it as a query
 *   parameter (`?after=<seq>`) on reconnect to trigger catch-up delivery.
 *   If the relay does not yet support `seq`, this module degrades gracefully
 *   by treating every reconnect as a fresh fetch (pull-based reconciliation).
 */

import { appendFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SseEvent {
  /** Relay-assigned monotonic sequence number. -1 when relay does not provide it. */
  seq: number;
  channelId: string;
  eventType: string;
  payload: unknown;
}

export interface SeqState {
  /** Last seen sequence number per channelId. */
  channels: Record<string, number>;
  updatedAt: string;
}

// ─── Persistence ─────────────────────────────────────────────────────────────

const SEQ_STATE_FILENAME = 'sse-seq-state.json';

function seqStatePath(identityDir: string): string {
  return join(identityDir, SEQ_STATE_FILENAME);
}

export function loadSeqState(identityDir: string): SeqState {
  const path = seqStatePath(identityDir);
  if (!existsSync(path)) return { channels: {}, updatedAt: new Date().toISOString() };
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as SeqState;
  } catch {
    return { channels: {}, updatedAt: new Date().toISOString() };
  }
}

export function saveSeqState(identityDir: string, state: SeqState): void {
  mkdirSync(identityDir, { recursive: true });
  state.updatedAt = new Date().toISOString();
  writeFileSync(seqStatePath(identityDir), JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 });
}

// ─── Sequencer ────────────────────────────────────────────────────────────────

export interface SequencerOptions {
  identityDir: string;
  /** Gap alert threshold: emit an alert after this many consecutive missed seqs. */
  gapAlertThreshold?: number;
  /** Called when a gap is detected in the sequence stream. */
  onGap?: (channelId: string, expectedSeq: number, receivedSeq: number) => void;
}

export class SseSequencer {
  private state: SeqState;
  private readonly identityDir: string;
  private readonly gapAlertThreshold: number;
  private readonly onGap?: (channelId: string, expectedSeq: number, receivedSeq: number) => void;

  constructor(opts: SequencerOptions) {
    this.identityDir = opts.identityDir;
    this.gapAlertThreshold = opts.gapAlertThreshold ?? 1;
    this.onGap = opts.onGap;
    this.state = loadSeqState(opts.identityDir);
  }

  /**
   * Record a received SSE event. Returns true if the event is in-order or has
   * no sequence information. Returns false if the event is a duplicate (already
   * seen). Calls onGap if a gap is detected.
   */
  record(event: SseEvent): boolean {
    if (event.seq < 0) return true; // relay does not support seq — pass through

    const lastSeen = this.state.channels[event.channelId] ?? -1;

    if (event.seq <= lastSeen) {
      // Duplicate or out-of-order — client should not reprocess
      return false;
    }

    const expected = lastSeen + 1;
    if (event.seq > expected) {
      this.alertGap(event.channelId, expected, event.seq);
    }

    this.state.channels[event.channelId] = event.seq;
    saveSeqState(this.identityDir, this.state);
    return true;
  }

  /** Return the last seen sequence number for a channel (-1 if never seen). */
  lastSeenSeq(channelId: string): number {
    return this.state.channels[channelId] ?? -1;
  }

  /**
   * Build a catch-up query string for a reconnect request.
   * The relay should honour ?after=<seq> to deliver missed events.
   */
  catchUpQuery(channelId: string): string {
    const seq = this.lastSeenSeq(channelId);
    return seq >= 0 ? `?after=${seq}` : '';
  }

  private alertGap(channelId: string, expected: number, received: number): void {
    const missed = received - expected;
    const msg = `[F0X-sse] Sequence gap on channel ${channelId}: expected seq ${expected}, got ${received} (${missed} event(s) missed)\n`;
    process.stderr.write(msg);
    appendGapAlert(this.identityDir, { channelId, expected, received, missed });
    if (this.onGap) this.onGap(channelId, expected, received);
  }
}

// ─── Gap alert log ────────────────────────────────────────────────────────────

interface GapAlert {
  channelId: string;
  expected: number;
  received: number;
  missed: number;
}

function appendGapAlert(identityDir: string, alert: GapAlert): void {
  const dir = identityDir ?? join(homedir(), '.f0x-chat');
  const path = join(dir, 'sse-gap-alerts.log');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const entry = JSON.stringify({ ts: new Date().toISOString(), event: 'sse_gap', ...alert }) + '\n';
  appendFileSync(path, entry, { encoding: 'utf8', mode: 0o600, flag: 'a' });
}

// ─── Reconciliation helper ────────────────────────────────────────────────────

export interface ReconcileOptions {
  /** Channels to reconcile on reconnect. */
  channelIds: string[];
  /** Fetch messages since last seen seq for a channel (catch-up pull). */
  fetchSince: (channelId: string, afterSeq: number) => Promise<SseEvent[]>;
  /** Handler to call for each caught-up event. */
  handler: (event: SseEvent) => void;
  sequencer: SseSequencer;
}

/**
 * Run after an SSE reconnect to catch up on missed events.
 * For each tracked channel, fetches events since the last seen sequence and
 * replays them through the handler in order.
 *
 * This ensures that SSE is treated as a notification channel only — authoritative
 * state is always reconciled via pull on reconnect.
 */
export async function reconcileAfterReconnect(opts: ReconcileOptions): Promise<void> {
  const { channelIds, fetchSince, handler, sequencer } = opts;
  for (const channelId of channelIds) {
    const lastSeen = sequencer.lastSeenSeq(channelId);
    try {
      const events = await fetchSince(channelId, lastSeen);
      const sorted = events.sort((a, b) => a.seq - b.seq);
      for (const event of sorted) {
        if (sequencer.record(event)) {
          handler(event);
        }
      }
    } catch (e) {
      process.stderr.write(
        `[F0X-sse] Reconciliation failed for channel ${channelId}: ${e instanceof Error ? e.message : String(e)}\n`
      );
    }
  }
}
