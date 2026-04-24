import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface PendingSendRecord {
  messageId: string;
  channelId: string;
  createdAt: string;
  status: 'pending' | 'sent';
}

function pendingDir(identityDir: string): string {
  return join(identityDir, 'pending-sends');
}

function pendingPath(identityDir: string, messageId: string): string {
  return join(pendingDir(identityDir), `${messageId}.json`);
}

function atomicWrite(path: string, payload: PendingSendRecord): void {
  const tmpPath = `${path}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600 });
  renameSync(tmpPath, path);
}

export function markSendPending(identityDir: string, messageId: string, channelId: string): void {
  mkdirSync(pendingDir(identityDir), { recursive: true, mode: 0o700 });
  atomicWrite(pendingPath(identityDir, messageId), {
    messageId,
    channelId,
    createdAt: new Date().toISOString(),
    status: 'pending'
  });
}

export function markSendDelivered(identityDir: string, messageId: string, channelId: string): void {
  const path = pendingPath(identityDir, messageId);
  if (!existsSync(path)) return;
  atomicWrite(path, {
    messageId,
    channelId,
    createdAt: new Date().toISOString(),
    status: 'sent'
  });
  unlinkSync(path);
}

export function listPendingSends(identityDir: string): PendingSendRecord[] {
  const dir = pendingDir(identityDir);
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  const records: PendingSendRecord[] = [];
  for (const file of files) {
    const parsed = JSON.parse(readFileSync(join(dir, file), 'utf8')) as PendingSendRecord;
    if (parsed.status === 'pending') records.push(parsed);
  }
  return records;
}

