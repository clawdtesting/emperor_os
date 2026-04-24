/**
 * Relay metadata minimization primitives.
 *
 * Even with end-to-end encryption, a relay observes communication graph
 * metadata: sender, recipient, channel, timing, and payload size. This module
 * provides client-side mitigations that reduce information leakage from each
 * of those vectors.
 *
 * LIMITATIONS (documented per the security model):
 *   - True unlinkability requires a mixnet or trusted relay cluster. These
 *     helpers reduce leakage but do not eliminate it for an adversarial relay.
 *   - Batching and delay windows are best-effort — operator must tune
 *     MAX_BATCH_DELAY_MS and COVER_INTERVAL_MS to sensitivity level.
 *   - Padding adds bandwidth overhead; tune PADDED_BLOCK_SIZE_BYTES to balance.
 */

import { randomBytes } from 'node:crypto';

// ─── Payload padding ──────────────────────────────────────────────────────────

/** Ciphertext padding block size (bytes). All ciphertexts are rounded up to a
 *  multiple of this value before being base64-encoded and submitted to the relay,
 *  preventing size-based traffic analysis. */
export const PADDED_BLOCK_SIZE_BYTES = 256;

/**
 * Pad a plaintext buffer to the next PADDED_BLOCK_SIZE_BYTES boundary using
 * ISO/IEC 7816-4 padding (0x80 byte followed by 0x00 bytes). The final block
 * is always added so the padding is unambiguous.
 */
export function padPlaintext(buf: Uint8Array): Uint8Array {
  const blockSize = PADDED_BLOCK_SIZE_BYTES;
  const padLen = blockSize - (buf.length % blockSize);
  const padded = new Uint8Array(buf.length + padLen);
  padded.set(buf, 0);
  padded[buf.length] = 0x80;
  return padded;
}

/**
 * Remove ISO/IEC 7816-4 padding from a decrypted buffer.
 * Throws if the padding is malformed (fail-closed).
 */
export function unpadPlaintext(buf: Uint8Array): Uint8Array {
  for (let i = buf.length - 1; i >= 0; i--) {
    if (buf[i] === 0x80) return buf.slice(0, i);
    if (buf[i] !== 0x00) throw new Error('Padding error: malformed ISO 7816-4 padding in decrypted message.');
  }
  throw new Error('Padding error: no padding marker found in decrypted message.');
}

// ─── Cover traffic ────────────────────────────────────────────────────────────

export interface CoverTrafficOptions {
  /** Relay URL — cover messages are sent to /api/relay/cover (no-op endpoint). */
  relayUrl: string;
  /** Bearer token for authentication. */
  token: string;
  /** Interval in ms between cover messages. Default: 30_000 (30 s). */
  intervalMs?: number;
}

export interface CoverTrafficHandle {
  stop(): void;
}

/**
 * Start periodic dummy message transmissions to mask real send patterns.
 *
 * Cover messages are zero-information: random 256-byte payloads, padded to the
 * standard block size, submitted to a dedicated cover endpoint that the relay
 * drops without storage. Operators SHOULD verify their relay exposes this
 * no-op endpoint; if it is absent the cover POST will fail silently (no
 * security guarantee, just no leakage from the failure itself).
 *
 * Set intervalMs to a value that makes the timing indistinguishable from real
 * sends for the sensitivity level of the channel. Jitter is added (+/- 20%).
 */
export function startCoverTraffic(opts: CoverTrafficOptions): CoverTrafficHandle {
  const { relayUrl, token } = opts;
  const baseInterval = opts.intervalMs ?? 30_000;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function jitter(ms: number): number {
    const variance = ms * 0.2;
    return ms - variance + Math.random() * 2 * variance;
  }

  async function sendCover(): Promise<void> {
    try {
      const payload = randomBytes(PADDED_BLOCK_SIZE_BYTES);
      await fetch(`${relayUrl}/api/relay/cover`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
        body: payload
      });
    } catch {
      // Intentionally swallow — cover failures must not surface as errors.
    }
    timer = setTimeout(() => { void sendCover(); }, jitter(baseInterval));
  }

  timer = setTimeout(() => { void sendCover(); }, jitter(baseInterval));
  return {
    stop() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    }
  };
}

// ─── Send batching ────────────────────────────────────────────────────────────

export interface BatchSendOptions {
  /** Maximum time (ms) to hold a message before flushing. Default: 500 ms. */
  maxDelayMs?: number;
  /** Maximum number of messages to hold before flushing immediately. Default: 4. */
  maxBatchSize?: number;
}

export type SendFn<T> = (items: T[]) => Promise<void>;

/**
 * Wrap a send function with a micro-batching window. Callers submit individual
 * items; the batcher coalesces them into a single relay call within maxDelayMs.
 *
 * Benefits:
 *   - Relay cannot distinguish individual sends from batched bursts.
 *   - Reduces per-message timing granularity visible to the relay.
 *   - Amortises HTTP overhead.
 *
 * The returned function resolves when the item has been handed to the relay
 * (after flush), and rejects if the underlying sendFn throws.
 */
export function createBatchSender<T>(sendFn: SendFn<T>, opts: BatchSendOptions = {}): (item: T) => Promise<void> {
  const maxDelayMs = opts.maxDelayMs ?? 500;
  const maxBatchSize = opts.maxBatchSize ?? 4;
  let batch: T[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let flushPromise: Promise<void> | undefined;

  const resolvers: Array<{ resolve: () => void; reject: (e: unknown) => void }> = [];

  function flush(): void {
    if (batch.length === 0) return;
    const toSend = batch.splice(0);
    const pending = resolvers.splice(0);
    if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
    flushPromise = sendFn(toSend).then(
      () => { pending.forEach((r) => r.resolve()); },
      (e: unknown) => { pending.forEach((r) => r.reject(e)); }
    );
  }

  return (item: T): Promise<void> => {
    return new Promise((resolve, reject) => {
      batch.push(item);
      resolvers.push({ resolve, reject });
      if (batch.length >= maxBatchSize) {
        flush();
      } else if (timer === undefined) {
        timer = setTimeout(flush, maxDelayMs);
      }
    });
  };
}

// ─── Operator policy helpers ──────────────────────────────────────────────────

export type ChannelSensitivity = 'standard' | 'high' | 'critical';

export interface ChannelPolicy {
  sensitivity: ChannelSensitivity;
  /** Whether cover traffic should be active while channel is open. */
  coverTrafficEnabled: boolean;
  /** Padding block size for this channel's messages. */
  paddedBlockSizeBytes: number;
  /** Max send batch delay (ms). 0 = no batching. */
  maxBatchDelayMs: number;
  /** Whether delayed delivery window should be used (mixnet-style). */
  delayedDeliveryEnabled: boolean;
  /** Minimum delivery delay (ms) when delayed delivery is enabled. */
  minDeliveryDelayMs: number;
  /** Maximum delivery delay (ms) when delayed delivery is enabled. */
  maxDeliveryDelayMs: number;
}

const CHANNEL_POLICIES: Record<ChannelSensitivity, ChannelPolicy> = {
  standard: {
    sensitivity: 'standard',
    coverTrafficEnabled: false,
    paddedBlockSizeBytes: PADDED_BLOCK_SIZE_BYTES,
    maxBatchDelayMs: 0,
    delayedDeliveryEnabled: false,
    minDeliveryDelayMs: 0,
    maxDeliveryDelayMs: 0
  },
  high: {
    sensitivity: 'high',
    coverTrafficEnabled: true,
    paddedBlockSizeBytes: PADDED_BLOCK_SIZE_BYTES * 2,
    maxBatchDelayMs: 500,
    delayedDeliveryEnabled: false,
    minDeliveryDelayMs: 0,
    maxDeliveryDelayMs: 0
  },
  critical: {
    sensitivity: 'critical',
    coverTrafficEnabled: true,
    paddedBlockSizeBytes: PADDED_BLOCK_SIZE_BYTES * 4,
    maxBatchDelayMs: 2000,
    delayedDeliveryEnabled: true,
    minDeliveryDelayMs: 1000,
    maxDeliveryDelayMs: 10_000
  }
};

export function getChannelPolicy(sensitivity: ChannelSensitivity = 'standard'): ChannelPolicy {
  return CHANNEL_POLICIES[sensitivity];
}

/**
 * Apply a random delivery delay for critical channels (mixnet-style).
 * Returns a promise that resolves after the delay.
 */
export function applyDeliveryDelay(policy: ChannelPolicy): Promise<void> {
  if (!policy.delayedDeliveryEnabled) return Promise.resolve();
  const delay = policy.minDeliveryDelayMs +
    Math.random() * (policy.maxDeliveryDelayMs - policy.minDeliveryDelayMs);
  return new Promise((resolve) => setTimeout(resolve, delay));
}
