import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AgentProfile, Channel } from '@/lib/types/domain';
import type { MessageEnvelope } from '@/lib/types/protocol';

export interface RelaySession {
  token: string;
  agentId: string;
  nonce: string;
  expiresAt: string;
}

export interface RelayStore {
  sessions: RelaySession[];
  agents: AgentProfile[];
  channels: Channel[];
  messages: MessageEnvelope[];
  replayIndex: string[];
}

const DATA_DIR = process.env.RELAY_DATA_DIR ?? path.join(process.cwd(), '.data');
const STORE_PATH = path.join(DATA_DIR, 'relay-store.json');

const EMPTY: RelayStore = {
  sessions: [],
  agents: [],
  channels: [],
  messages: [],
  replayIndex: []
};

async function ensureStoreFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(STORE_PATH);
  } catch {
    await fs.writeFile(STORE_PATH, JSON.stringify(EMPTY, null, 2), 'utf8');
  }
}

export async function readStore(): Promise<RelayStore> {
  await ensureStoreFile();
  const raw = await fs.readFile(STORE_PATH, 'utf8');
  return JSON.parse(raw) as RelayStore;
}

export async function writeStore(store: RelayStore): Promise<void> {
  await ensureStoreFile();
  const tmp = `${STORE_PATH}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), 'utf8');
  await fs.rename(tmp, STORE_PATH);
}
