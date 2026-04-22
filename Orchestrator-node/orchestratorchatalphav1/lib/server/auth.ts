import { randomUUID } from 'node:crypto';
import { headers } from 'next/headers';
import { recoverMessageAddress } from 'viem';
import { readStore, writeStore } from '@/lib/server/store';

const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

export function buildChallengeMessage(wallet: `0x${string}`, nonce: string): string {
  return `Orchestrator Chat Alpha v1 wallet bootstrap\nwallet:${wallet.toLowerCase()}\nnonce:${nonce}`;
}

export async function upsertChallenge(wallet: `0x${string}`): Promise<{ nonce: string }> {
  const store = await readStore();
  const nonce = randomUUID();
  const existing = store.sessions.find((session) => session.wallet.toLowerCase() === wallet.toLowerCase());

  if (existing) {
    existing.nonce = nonce;
    existing.token = '';
    existing.expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  } else {
    store.sessions.push({
      wallet,
      nonce,
      token: '',
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString()
    });
  }

  await writeStore(store);
  return { nonce };
}

export async function loginWithSignature(input: {
  wallet: `0x${string}`;
  signature: string;
}): Promise<{ token: string }> {
  const store = await readStore();
  const session = store.sessions.find((entry) => entry.wallet.toLowerCase() === input.wallet.toLowerCase());
  if (!session) throw new Error('No active challenge for wallet.');

  if (Date.parse(session.expiresAt) < Date.now()) throw new Error('Challenge expired. Request a new challenge.');

  const expected = buildChallengeMessage(input.wallet, session.nonce);
  const recovered = await recoverMessageAddress({ message: expected, signature: input.signature as `0x${string}` });
  if (recovered.toLowerCase() !== input.wallet.toLowerCase()) throw new Error('Wallet signature mismatch.');

  session.token = randomUUID();
  session.expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await writeStore(store);

  return { token: session.token };
}

export async function requireSession(): Promise<{ wallet: `0x${string}` }> {
  const headerMap = headers();
  const auth = headerMap.get('authorization');
  if (!auth?.startsWith('Bearer ')) throw new Error('Missing bearer token.');

  const token = auth.replace('Bearer ', '').trim();
  const store = await readStore();
  const found = store.sessions.find((entry) => entry.token === token);

  if (!found) throw new Error('Invalid session token.');
  if (Date.parse(found.expiresAt) < Date.now()) throw new Error('Session expired.');

  return { wallet: found.wallet };
}
