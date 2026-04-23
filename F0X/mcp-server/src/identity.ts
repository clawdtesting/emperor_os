/**
 * Identity and channel-key management for the MCP server agent.
 *
 * Identity file (default: ~/.f0x-chat/identity.json):
 *   { agentId, label, signingPublicKey, signingSecretKey,
 *     encryptionPublicKey, encryptionSecretKey, createdAt, updatedAt }
 *
 * Channel key cache (default: ~/.f0x-chat/channels/<channelId>.json):
 *   { channelId, channelKeyBase64, peerId, peerLabel, replayCounter, updatedAt }
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  chmodSync,
  statSync,
  readdirSync
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { generateSigningKeyPair, generateEncryptionKeyPair } from './crypto.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentIdentityFile {
  agentId: string;
  label: string;
  signingPublicKey: string;
  signingSecretKey: string;
  encryptionPublicKey: string;
  encryptionSecretKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelKeyFile {
  channelId: string;
  channelKeyBase64: string;
  peerId: string;
  peerLabel: string;
  replayCounter: number;
  updatedAt: string;
}

interface IdentityContinuityFile {
  expectedAgentId: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Paths ────────────────────────────────────────────────────────────────────

export function defaultIdentityDir(): string {
  return join(homedir(), '.f0x-chat');
}

export function resolveIdentityPath(dir: string): string {
  return join(dir, 'identity.json');
}

export function resolveChannelKeyPath(dir: string, channelId: string): string {
  return join(dir, 'channels', `${channelId}.json`);
}

function resolveContinuityPath(dir: string): string {
  return join(dir, 'identity-continuity.json');
}

// ─── Permission checks ───────────────────────────────────────────────────────

const DIR_MODE_700 = 0o700;
const FILE_MODE_600 = 0o600;
const PERMISSION_MASK = 0o777;

function formatMode(mode: number): string {
  return `0${(mode & PERMISSION_MASK).toString(8)}`;
}

function ensureDirMode(path: string, expectedMode: number): void {
  const currentMode = statSync(path).mode & PERMISSION_MASK;
  if (currentMode !== expectedMode) {
    throw new Error(
      `Insecure identity directory permissions for ${path}. ` +
      `Expected ${formatMode(expectedMode)}, found ${formatMode(currentMode)}. ` +
      'Run: chmod 700 ~/.f0x-chat'
    );
  }
}

function ensureFileMode(path: string, expectedMode: number): void {
  const currentMode = statSync(path).mode & PERMISSION_MASK;
  if (currentMode !== expectedMode) {
    throw new Error(
      `Insecure identity file permissions for ${path}. ` +
      `Expected ${formatMode(expectedMode)}, found ${formatMode(currentMode)}. ` +
      'Run: chmod 600 ~/.f0x-chat/identity.json'
    );
  }
}

function writeContinuityFile(identityDir: string, agentId: string): void {
  const continuityPath = resolveContinuityPath(identityDir);
  const now = new Date().toISOString();
  const payload: IdentityContinuityFile = {
    expectedAgentId: agentId,
    createdAt: now,
    updatedAt: now
  };
  writeFileSync(continuityPath, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: FILE_MODE_600 });
  chmodSync(continuityPath, FILE_MODE_600);
}

function enforceIdentityContinuity(identityDir: string, identityPath: string): void {
  const continuityPath = resolveContinuityPath(identityDir);
  if (!existsSync(continuityPath)) return;
  ensureFileMode(continuityPath, FILE_MODE_600);
  const continuity = JSON.parse(readFileSync(continuityPath, 'utf8')) as IdentityContinuityFile;
  if (!existsSync(identityPath)) {
    throw new Error(
      `Identity continuity check failed: ${identityPath} is missing while continuity file exists. ` +
      'Refusing to silently regenerate identity; restore original identity file or rotate explicitly.'
    );
  }
  const identity = JSON.parse(readFileSync(identityPath, 'utf8')) as AgentIdentityFile;
  if (identity.agentId !== continuity.expectedAgentId) {
    throw new Error(
      `Identity continuity check failed: expected agentId ${continuity.expectedAgentId}, found ${identity.agentId}. ` +
      'Refusing to continue with mismatched identity.'
    );
  }
}

// ─── Identity ─────────────────────────────────────────────────────────────────

export function loadOrCreateIdentity(identityDir: string, defaultLabel = 'hermes-agent'): AgentIdentityFile {
  mkdirSync(identityDir, { recursive: true });
  chmodSync(identityDir, DIR_MODE_700);
  ensureDirMode(identityDir, DIR_MODE_700);
  const identityPath = resolveIdentityPath(identityDir);
  enforceIdentityContinuity(identityDir, identityPath);

  if (existsSync(identityPath)) {
    ensureFileMode(identityPath, FILE_MODE_600);
    const loaded = JSON.parse(readFileSync(identityPath, 'utf8')) as AgentIdentityFile;
    if (!existsSync(resolveContinuityPath(identityDir))) {
      writeContinuityFile(identityDir, loaded.agentId);
    }
    return loaded;
  }

  const now = new Date().toISOString();
  const signing = generateSigningKeyPair();
  const encryption = generateEncryptionKeyPair();

  const identity: AgentIdentityFile = {
    agentId: randomUUID(),
    label: defaultLabel,
    signingPublicKey: signing.publicKeyBase64,
    signingSecretKey: signing.secretKeyBase64,
    encryptionPublicKey: encryption.publicKeyBase64,
    encryptionSecretKey: encryption.secretKeyBase64,
    createdAt: now,
    updatedAt: now
  };

  writeFileSync(identityPath, JSON.stringify(identity, null, 2), { encoding: 'utf8', mode: FILE_MODE_600 });
  chmodSync(identityPath, FILE_MODE_600);
  ensureFileMode(identityPath, FILE_MODE_600);
  writeContinuityFile(identityDir, identity.agentId);
  return identity;
}

export function saveIdentity(identityDir: string, identity: AgentIdentityFile): void {
  mkdirSync(identityDir, { recursive: true });
  chmodSync(identityDir, DIR_MODE_700);
  ensureDirMode(identityDir, DIR_MODE_700);
  identity.updatedAt = new Date().toISOString();
  const identityPath = resolveIdentityPath(identityDir);
  writeFileSync(identityPath, JSON.stringify(identity, null, 2), { encoding: 'utf8', mode: FILE_MODE_600 });
  chmodSync(identityPath, FILE_MODE_600);
  ensureFileMode(identityPath, FILE_MODE_600);
  writeContinuityFile(identityDir, identity.agentId);
}

// ─── Channel keys ─────────────────────────────────────────────────────────────

export function loadChannelKey(identityDir: string, channelId: string): ChannelKeyFile | null {
  const path = resolveChannelKeyPath(identityDir, channelId);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as ChannelKeyFile;
}

export function saveChannelKey(identityDir: string, data: ChannelKeyFile): void {
  const channelDir = join(identityDir, 'channels');
  mkdirSync(channelDir, { recursive: true });
  data.updatedAt = new Date().toISOString();
  writeFileSync(resolveChannelKeyPath(identityDir, data.channelId), JSON.stringify(data, null, 2), 'utf8');
}

export function incrementReplayCounter(identityDir: string, channelId: string): number {
  const existing = loadChannelKey(identityDir, channelId);
  if (!existing) throw new Error(`No channel key found for channelId: ${channelId}`);
  existing.replayCounter += 1;
  saveChannelKey(identityDir, existing);
  return existing.replayCounter;
}

export function runLocalIntegrityChecks(identityDir: string): void {
  const channelDir = join(identityDir, 'channels');
  if (!existsSync(channelDir)) return;
  const entries = readdirSync(channelDir).filter((f) => f.endsWith('.json'));
  for (const entry of entries) {
    const path = join(channelDir, entry);
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<ChannelKeyFile>;
      if (typeof parsed.channelId !== 'string' || !parsed.channelId) throw new Error('missing channelId');
      if (typeof parsed.channelKeyBase64 !== 'string' || !parsed.channelKeyBase64) throw new Error('missing channelKeyBase64');
      if (typeof parsed.peerId !== 'string' || !parsed.peerId) throw new Error('missing peerId');
      if (typeof parsed.replayCounter !== 'number' || !Number.isInteger(parsed.replayCounter) || parsed.replayCounter < 0) {
        throw new Error('invalid replayCounter');
      }
    } catch (err) {
      throw new Error(`Channel key integrity check failed for ${path}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
