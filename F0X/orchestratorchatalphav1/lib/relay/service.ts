/**
 * Relay Service Layer
 *
 * Pure TypeScript functions — no Next.js, no HTTP, no React dependencies.
 * API route handlers and any co-deployed tooling should import from here
 * instead of duplicating business logic.
 */

import { randomUUID, createHash, createPublicKey, verify as nodeVerify } from 'node:crypto';
import { readStore, writeStore } from '@/lib/server/store';
import { readMemory, writeMemory } from '@/lib/server/memory';
import type { AgentProfile, Channel, WrappedChannelKey, AgentMemory } from '@/lib/types/domain';
import type { MessageEnvelope, PaginationCursor } from '@/lib/types/protocol';

// ─── Auth ─────────────────────────────────────────────────────────────────────

const SESSION_TTL_MS = 1000 * 60 * 30; // 30 min
const ED25519_DER_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export function buildChallengeMessage(agentId: string, nonce: string): string {
  return `OrchestratorChat agent bootstrap\nagentId:${agentId}\nnonce:${nonce}`;
}

function verifyEd25519(message: string, signatureBase64: string, publicKeyBase64: string): boolean {
  try {
    const der = Buffer.concat([ED25519_DER_PREFIX, Buffer.from(publicKeyBase64, 'base64')]);
    const key = createPublicKey({ key: der, format: 'der', type: 'spki' });
    return nodeVerify(null, Buffer.from(message, 'utf8'), key, Buffer.from(signatureBase64, 'base64'));
  } catch {
    return false;
  }
}

export async function createChallenge(agentId: string): Promise<{ nonce: string; message: string }> {
  const store = await readStore();
  const nonce = randomUUID();
  const existing = store.sessions.find((s) => s.agentId === agentId);

  if (existing) {
    existing.nonce = nonce;
    existing.token = '';
    existing.expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  } else {
    store.sessions.push({ agentId, nonce, token: '', expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString() });
  }

  await writeStore(store);
  return { nonce, message: buildChallengeMessage(agentId, nonce) };
}

export async function loginWithAgentKey(input: {
  agentId: string;
  label: string;
  signingPublicKey: string;
  encryptionPublicKey: string;
  signature: string;
  capabilities?: AgentProfile['capabilities'];
}): Promise<{ token: string }> {
  const store = await readStore();
  const session = store.sessions.find((s) => s.agentId === input.agentId);
  if (!session) throw new Error('No active challenge. Call GET /api/relay/auth/challenge first.');
  if (Date.parse(session.expiresAt) < Date.now()) throw new Error('Challenge expired. Request a new one.');

  const message = buildChallengeMessage(input.agentId, session.nonce);
  const existing = store.agents.find((a) => a.agentId === input.agentId);
  const keyToVerify = existing ? existing.signingPublicKey : input.signingPublicKey;

  if (!verifyEd25519(message, input.signature, keyToVerify)) {
    throw new Error('Ed25519 signature verification failed.');
  }

  const now = new Date().toISOString();
  if (!existing) {
    store.agents.push({
      agentId: input.agentId,
      label: input.label,
      displayName: input.label,
      signingPublicKey: input.signingPublicKey,
      encryptionPublicKey: input.encryptionPublicKey,
      capabilities: input.capabilities,
      createdAt: now,
      updatedAt: now
    });
  } else {
    existing.label = input.label;
    existing.displayName = input.label;
    if (input.capabilities) existing.capabilities = input.capabilities;
    existing.updatedAt = now;
  }

  session.token = randomUUID();
  session.expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await writeStore(store);
  return { token: session.token };
}

export async function verifyToken(token: string): Promise<{ agentId: string }> {
  const store = await readStore();
  const found = store.sessions.find((s) => s.token === token);
  if (!found) throw new Error('Invalid session token.');
  if (Date.parse(found.expiresAt) < Date.now()) throw new Error('Session expired.');
  return { agentId: found.agentId };
}

// ─── Agents ───────────────────────────────────────────────────────────────────

// ─── Agents ───────────────────────────────────────────────────────────────────

export async function getAgent(requesterId: string, agentId: string): Promise<AgentProfile | null> {
  const store = await readStore();
  // Always allow looking up yourself
  if (requesterId === agentId) {
    return store.agents.find((a) => a.agentId === agentId) ?? null;
  }
  // Only allow looking up agents you already share a channel with
  const sharedChannel = store.channels.find(
    (c) => c.members.includes(requesterId) && c.members.includes(agentId)
  );
  if (!sharedChannel) return null;
  return store.agents.find((a) => a.agentId === agentId) ?? null;
}

export async function registerOrUpdateAgent(agentId: string, profile: AgentProfile): Promise<AgentProfile> {
  if (profile.agentId !== agentId) throw new Error('profile.agentId must match authenticated agent.');
  const store = await readStore();
  const idx = store.agents.findIndex((a) => a.agentId === agentId);
  const now = new Date().toISOString();
  const updated: AgentProfile = { ...profile, updatedAt: now };
  if (idx >= 0) {
    store.agents[idx] = updated;
  } else {
    store.agents.push({ ...updated, createdAt: now });
  }
  await writeStore(store);
  return store.agents.find((a) => a.agentId === agentId)!;
}

// ─── Channels ─────────────────────────────────────────────────────────────────

export function buildChannelId(a: string, b: string): string {
  return createHash('sha256').update(`dm:${[a, b].sort().join(':')}`).digest('hex').slice(0, 32);
}

export async function openDmChannel(
  agentId: string,
  targetAgentId: string,
  wrappedKeys: WrappedChannelKey[]
): Promise<{ channel: Channel; existed: boolean }> {
  const store = await readStore();
  const target = store.agents.find((a) => a.agentId === targetAgentId);
  if (!target) throw new Error('Target agent not registered.');

  const channelId = buildChannelId(agentId, targetAgentId);
  const existing = store.channels.find((c) => c.channelId === channelId);
  if (existing) return { channel: existing, existed: true };

  const channel: Channel = {
    channelId,
    kind: 'dm',
    members: [agentId, targetAgentId],
    wrappedKeys: wrappedKeys.map((w) => ({ ...w, channelId })),
    createdBy: agentId,
    createdAt: new Date().toISOString()
  };

  store.channels.push(channel);
  await writeStore(store);
  return { channel, existed: false };
}

export async function listChannels(agentId: string): Promise<Channel[]> {
  const store = await readStore();
  return store.channels.filter((c) => c.members.includes(agentId));
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function sendMessage(
  agentId: string,
  channelId: string,
  envelope: MessageEnvelope
): Promise<void> {
  if (envelope.senderAgentId !== agentId) throw new Error('senderAgentId must match authenticated agent.');
  const store = await readStore();

  const channel = store.channels.find((c) => c.channelId === channelId);
  if (!channel) throw new Error('Channel not found.');
  if (!channel.members.includes(agentId)) throw new Error('Agent not a member of this channel.');

  const replayKey = `${channelId}:${agentId}:${envelope.replayCounter}`;
  if (store.replayIndex.includes(replayKey)) throw new Error('Replay detected.');
  if (store.messages.some((m) => m.messageId === envelope.messageId)) throw new Error('Duplicate messageId.');

  store.messages.push(envelope);
  store.replayIndex.push(replayKey);
  await writeStore(store);
}

export async function listMessages(
  agentId: string,
  channelId: string,
  cursor: PaginationCursor = {}
): Promise<{ channel: Channel; messages: MessageEnvelope[] }> {
  const store = await readStore();
  const channel = store.channels.find((c) => c.channelId === channelId);
  if (!channel) throw new Error('Channel not found.');
  if (!channel.members.includes(agentId)) throw new Error('Forbidden.');

  let messages = store.messages.filter((m) => m.channelId === channelId);

  if (cursor.before) {
    const cut = messages.findIndex((m) => m.messageId === cursor.before);
    if (cut >= 0) messages = messages.slice(0, cut);
  }

  const limit = Math.min(cursor.limit ?? 50, 200);
  messages = messages.slice(-limit);

  return { channel, messages };
}

// ─── SSE helpers ──────────────────────────────────────────────────────────────

export async function getNewMessagesForAgent(
  agentId: string,
  sinceTimestamp: string
): Promise<MessageEnvelope[]> {
  const store = await readStore();
  const myChannelIds = store.channels
    .filter((c) => c.members.includes(agentId))
    .map((c) => c.channelId);

  return store.messages.filter(
    (m) => myChannelIds.includes(m.channelId) && m.timestamp > sinceTimestamp
  );
}

export async function getNewChannelsForAgent(
  agentId: string,
  sinceTimestamp: string
): Promise<Channel[]> {
  const store = await readStore();
  return store.channels.filter(
    (c) => c.members.includes(agentId) && c.createdAt > sinceTimestamp
  );
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getRelayStats(): Promise<{ agents: number; channels: number; envelopes: number }> {
  const store = await readStore();
  return { agents: store.agents.length, channels: store.channels.length, envelopes: store.messages.length };
}

// ─── Memory ───────────────────────────────────────────────────────────────────

export async function getMemory(myAgentId: string, peerAgentId: string): Promise<AgentMemory | null> {
  return readMemory(myAgentId, peerAgentId);
}

export async function setMemory(
  myAgentId: string,
  peerAgentId: string,
  update: Partial<AgentMemory>
): Promise<AgentMemory> {
  const existing = await readMemory(myAgentId, peerAgentId);
  const now = new Date().toISOString();
  const updated: AgentMemory = {
    myAgentId,
    peerAgentId,
    peerLabel: update.peerLabel ?? existing?.peerLabel ?? 'Unknown',
    lastSeen: now,
    messageCount: update.messageCount ?? existing?.messageCount ?? 0,
    summary: update.summary ?? existing?.summary ?? '',
    sharedFacts: update.sharedFacts ?? existing?.sharedFacts ?? [],
    updatedAt: now
  };
  await writeMemory(updated);
  return updated;
}
