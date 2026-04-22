import { randomUUID, createPublicKey, verify as nodeVerify } from 'node:crypto';
import { headers } from 'next/headers';
import { readStore, writeStore } from '@/lib/server/store';

const SESSION_TTL_MS = 1000 * 60 * 30; // 30 minutes

// DER SPKI prefix for a raw 32-byte Ed25519 public key
const ED25519_DER_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export function buildChallengeMessage(agentId: string, nonce: string): string {
  return `OrchestratorChat agent bootstrap\nagentId:${agentId}\nnonce:${nonce}`;
}

function verifyEd25519(message: string, signatureBase64: string, publicKeyBase64: string): boolean {
  try {
    const rawKey = Buffer.from(publicKeyBase64, 'base64');
    const der = Buffer.concat([ED25519_DER_PREFIX, rawKey]);
    const keyObject = createPublicKey({ key: der, format: 'der', type: 'spki' });
    return nodeVerify(null, Buffer.from(message, 'utf8'), keyObject, Buffer.from(signatureBase64, 'base64'));
  } catch {
    return false;
  }
}

export async function upsertChallenge(agentId: string): Promise<{ nonce: string }> {
  const store = await readStore();
  const nonce = randomUUID();
  const existing = store.sessions.find((s) => s.agentId === agentId);

  if (existing) {
    existing.nonce = nonce;
    existing.token = '';
    existing.expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  } else {
    store.sessions.push({
      agentId,
      nonce,
      token: '',
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString()
    });
  }

  await writeStore(store);
  return { nonce };
}

export async function loginWithAgentKey(input: {
  agentId: string;
  label: string;
  signingPublicKey: string;
  encryptionPublicKey: string;
  signature: string;
}): Promise<{ token: string }> {
  const store = await readStore();
  const session = store.sessions.find((s) => s.agentId === input.agentId);
  if (!session) throw new Error('No active challenge. Call GET /api/relay/auth/challenge first.');
  if (Date.parse(session.expiresAt) < Date.now()) throw new Error('Challenge expired. Request a new one.');

  const message = buildChallengeMessage(input.agentId, session.nonce);
  const existingAgent = store.agents.find((a) => a.agentId === input.agentId);

  // Verify against stored key if agent exists, else against the provided key
  const keyToVerify = existingAgent ? existingAgent.signingPublicKey : input.signingPublicKey;
  if (!verifyEd25519(message, input.signature, keyToVerify)) {
    throw new Error('Ed25519 signature verification failed.');
  }

  // Auto-register on first login
  if (!existingAgent) {
    store.agents.push({
      agentId: input.agentId,
      label: input.label,
      signingPublicKey: input.signingPublicKey,
      encryptionPublicKey: input.encryptionPublicKey,
      createdAt: new Date().toISOString()
    });
  }

  session.token = randomUUID();
  session.expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await writeStore(store);

  return { token: session.token };
}

export async function requireSession(): Promise<{ agentId: string }> {
  const headerMap = headers();
  const auth = headerMap.get('authorization');
  if (!auth?.startsWith('Bearer ')) throw new Error('Missing bearer token.');

  const token = auth.replace('Bearer ', '').trim();
  const store = await readStore();
  const found = store.sessions.find((s) => s.token === token);

  if (!found) throw new Error('Invalid session token.');
  if (Date.parse(found.expiresAt) < Date.now()) throw new Error('Session expired.');

  return { agentId: found.agentId };
}
