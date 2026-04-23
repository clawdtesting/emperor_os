/**
 * Shared business logic for F0X agent sessions.
 * Used by both the MCP server adapter (tools.ts) and the UI server.
 * Returns plain typed values — no MCP formatting here.
 */

import { RelayAuthError, RelayRateLimitError, type RelayClient, type Channel, type MessageEnvelope } from '../relay-client.js';
import type { AgentIdentityFile } from '../identity.js';
import {
  signChallenge,
  wrapChannelKey,
  unwrapChannelKey,
  encryptMessage,
  decryptMessage,
  signEnvelope,
  verifyEnvelopeSignature,
  generateChannelKey,
  randomUUID
} from '../crypto.js';
import {
  loadChannelKey,
  saveChannelKey,
  incrementReplayCounter
} from '../identity.js';
import { recordReplayAnomaly, recordReplayRejection } from '../security-observability.js';
import { assertRateLimit } from '../rate-limiter.js';

// ─── Session ──────────────────────────────────────────────────────────────────

export interface F0XSession {
  relay: RelayClient;
  identity: AgentIdentityFile;
  identityDir: string;
  relayUrl: string;
}
const highestObservedReplay = new Map<string, number>();

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function performLogin(session: F0XSession): Promise<{ token: string }> {
  const { relay, identity } = session;
  const challenge = await relay.getChallenge(identity.agentId);
  const signature = signChallenge(challenge.message, identity.signingSecretKey);
  return relay.login({
    agentId: identity.agentId,
    label: identity.label,
    signingPublicKey: identity.signingPublicKey,
    encryptionPublicKey: identity.encryptionPublicKey,
    signature,
    capabilities: { mcp: true, sse: true }
  });
}

async function withReauth<T>(session: F0XSession, op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (e) {
    if (!(e instanceof RelayAuthError)) throw e;
    await performLogin(session);
    return op();
  }
}

// ─── Channel key resolution ───────────────────────────────────────────────────

export async function ensureChannelKey(session: F0XSession, channel: Channel): Promise<Uint8Array> {
  const { relay, identity, identityDir } = session;

  const existing = loadChannelKey(identityDir, channel.channelId);
  if (existing) return new Uint8Array(Buffer.from(existing.channelKeyBase64, 'base64'));

  const myWrap = channel.wrappedKeys.find((w) => w.forAgentId === identity.agentId);
  if (!myWrap) throw new Error('No wrapped key found for this agent in channel.');

  const senderEncPublic = myWrap.fromAgentId === identity.agentId
    ? identity.encryptionPublicKey
    : await (async () => {
        const sender = await relay.getAgent(myWrap.fromAgentId);
        if (!sender) throw new Error('Sender agent not found.');
        return sender.encryptionPublicKey;
      })();

  const channelKey = unwrapChannelKey(
    myWrap.wrappedKeyB64,
    myWrap.nonceB64,
    senderEncPublic,
    identity.encryptionSecretKey
  );

  const peerId = channel.members.find((m) => m !== identity.agentId) ?? '';
  const peerProfile = await relay.getAgent(peerId);
  const peerLabel = peerProfile?.label ?? peerId;

  saveChannelKey(identityDir, {
    channelId: channel.channelId,
    channelKeyBase64: Buffer.from(channelKey).toString('base64'),
    peerId,
    peerLabel,
    replayCounter: 0,
    updatedAt: new Date().toISOString()
  });

  return channelKey;
}

// ─── Channels ─────────────────────────────────────────────────────────────────

export interface ChannelSummary {
  channelId: string;
  peerId: string;
  peerLabel: string;
}

export async function listChannels(session: F0XSession): Promise<ChannelSummary[]> {
  const { relay, identity } = session;
  const channels = await withReauth(session, () => relay.listChannels());
  return Promise.all(channels.map(async (c) => {
    const peerId = c.members.find((m) => m !== identity.agentId) ?? '';
    const peer = await withReauth(session, () => relay.getAgent(peerId));
    return { channelId: c.channelId, peerId, peerLabel: peer?.label ?? '(unknown)' };
  }));
}

export interface OpenChannelResult {
  channelId: string;
  peerId: string;
  peerLabel: string;
  existed: boolean;
}

export async function openChannel(session: F0XSession, targetAgentId: string): Promise<OpenChannelResult> {
  const { relay, identity, identityDir } = session;
  assertRateLimit(`ui:open_channel:${identity.agentId}`, { windowMs: 60_000, maxInWindow: 6, burstWindowMs: 10_000, burstMax: 2 });

  const target = await withReauth(session, () => relay.getAgent(targetAgentId));
  if (!target) throw new Error(`Agent ${targetAgentId} not found.`);

  const channelKey = generateChannelKey();
  const now = new Date().toISOString();

  const wrapForTarget = wrapChannelKey(channelKey, target.encryptionPublicKey, identity.encryptionSecretKey);
  const wrapForSelf  = wrapChannelKey(channelKey, identity.encryptionPublicKey, identity.encryptionSecretKey);

  const wrappedKeys = [
    { wrapId: wrapForTarget.wrapId, channelId: 'pending', forAgentId: targetAgentId,       fromAgentId: identity.agentId, nonceB64: wrapForTarget.nonceB64, wrappedKeyB64: wrapForTarget.wrappedKeyB64, createdAt: now },
    { wrapId: wrapForSelf.wrapId,   channelId: 'pending', forAgentId: identity.agentId,    fromAgentId: identity.agentId, nonceB64: wrapForSelf.nonceB64,   wrappedKeyB64: wrapForSelf.wrappedKeyB64,   createdAt: now }
  ];

  const { channel, existed } = await withReauth(session, () => relay.openDmChannel({
    creatorAgentId: identity.agentId,
    targetAgentId,
    wrappedKeys
  }));

  if (!existed) {
    saveChannelKey(identityDir, {
      channelId: channel.channelId,
      channelKeyBase64: Buffer.from(channelKey).toString('base64'),
      peerId: targetAgentId,
      peerLabel: target.label,
      replayCounter: 0,
      updatedAt: now
    });
  }

  return { channelId: channel.channelId, peerId: targetAgentId, peerLabel: target.label, existed };
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export interface DecryptedMessage {
  messageId: string;
  channelId: string;
  senderAgentId: string;
  senderLabel: string;
  timestamp: string;
  text: string;
  signatureValid: boolean;
  isMine: boolean;
}

/**
 * Fetches and decrypts all messages in a channel.
 * Intended for UI use — the MCP layer intentionally does not decrypt in bulk
 * to keep message content out of LLM context until explicitly requested.
 */
export async function fetchMessages(
  session: F0XSession,
  channelId: string,
  opts: { limit?: number; before?: string } = {}
): Promise<DecryptedMessage[]> {
  const { relay, identity } = session;
  const { channel, messages } = await withReauth(session, () => relay.listMessages(channelId, {
    limit: opts.limit ?? 50,
    before: opts.before
  }));

  const channelKey = await ensureChannelKey(session, channel);

  // Cache sender profiles to avoid one relay call per message.
  const profileCache = new Map<string, { label: string; signingPublicKey: string } | null>();
  async function getSender(agentId: string) {
    if (!profileCache.has(agentId)) {
      const p = await withReauth(session, () => relay.getAgent(agentId));
      profileCache.set(agentId, p ? { label: p.label, signingPublicKey: p.signingPublicKey } : null);
    }
    return profileCache.get(agentId) ?? null;
  }

  const results: DecryptedMessage[] = [];
  for (const env of messages) {
    try {
      const sender = await getSender(env.senderAgentId);
      const signatureValid = sender
        ? verifyEnvelopeSignature(
            {
              messageId: env.messageId, channelId: env.channelId,
              senderAgentId: env.senderAgentId, timestamp: env.timestamp,
              replayCounter: env.replayCounter, nonceB64: env.nonceB64,
              ciphertextB64: env.ciphertextB64
            },
            env.signatureB64,
            sender.signingPublicKey
          )
        : false;
      if (!signatureValid) {
        continue;
      }

      const replayKey = `${env.channelId}:${env.senderAgentId}`;
      const previousCounter = highestObservedReplay.get(replayKey);
      if (previousCounter !== undefined && env.replayCounter <= previousCounter) {
        recordReplayAnomaly({
          context: 'ui',
          channelId: env.channelId,
          senderAgentId: env.senderAgentId,
          replayCounter: env.replayCounter,
          previousCounter,
          detail: 'non-monotonic replay counter observed while fetching messages'
        });
        continue;
      }
      highestObservedReplay.set(replayKey, env.replayCounter);

      const rawText = decryptMessage(env.ciphertextB64, env.nonceB64, channelKey);

      results.push({
        messageId: env.messageId,
        channelId: env.channelId,
        senderAgentId: env.senderAgentId,
        senderLabel: sender?.label ?? env.senderAgentId,
        timestamp: env.timestamp,
        text: rawText,
        signatureValid,
        isMine: env.senderAgentId === identity.agentId
      });
    } catch {
      // Skip messages that cannot be decrypted (wrong key, corruption, etc.)
    }
  }
  return results;
}

export interface SentMessageResult {
  messageId: string;
  channelId: string;
  timestamp: string;
}

export async function sendMessage(
  session: F0XSession,
  channelId: string,
  text: string
): Promise<SentMessageResult> {
  if (!text || text.trim().length === 0) throw new Error('Message text cannot be empty.');
  if (text.length > 32768) throw new Error('Message too long (max 32768 characters).');

  const { relay, identity, identityDir } = session;
  assertRateLimit(`ui:send:${identity.agentId}`, { windowMs: 60_000, maxInWindow: 60, burstWindowMs: 1_000, burstMax: 10 });
  const { channel } = await withReauth(session, () => relay.listMessages(channelId, { limit: 1 }));
  const channelKey = await ensureChannelKey(session, channel);

  const { nonceB64, ciphertextB64 } = encryptMessage(text, channelKey);
  const replayCounter = incrementReplayCounter(identityDir, channelId);
  const messageId = randomUUID();
  const timestamp = new Date().toISOString();

  const payload = {
    messageId, channelId,
    senderAgentId: identity.agentId,
    timestamp, replayCounter, nonceB64, ciphertextB64
  };
  const signatureB64 = signEnvelope(payload, identity.signingSecretKey);
  const envelope: MessageEnvelope = { ...payload, signatureB64 };

  try {
    await withReauth(session, () => relay.sendMessage(channelId, envelope));
  } catch (sendErr) {
    if (sendErr instanceof RelayRateLimitError) {
      const retryHint = sendErr.retryAfterSeconds !== undefined ? ` Retry after ~${sendErr.retryAfterSeconds}s.` : '';
      throw new Error(`Relay rate limit exceeded.${retryHint}`);
    }
    if (sendErr instanceof Error && /replay/i.test(sendErr.message)) {
      recordReplayRejection({
        context: 'ui',
        channelId,
        senderAgentId: identity.agentId,
        detail: sendErr.message
      });
    }
    throw sendErr;
  }
  return { messageId, channelId, timestamp };
}
