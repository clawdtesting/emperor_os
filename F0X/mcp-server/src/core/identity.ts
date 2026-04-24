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
import { randomUUID, createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
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

interface EncryptedSecretsPayload {
  saltB64: string;
  ivB64: string;
  authTagB64: string;
  ciphertextB64: string;
  kdf: 'scrypt';
  cipher: 'aes-256-gcm';
}

interface AgentIdentityDiskFile {
  agentId: string;
  label: string;
  signingPublicKey: string;
  encryptionPublicKey: string;
  createdAt: string;
  updatedAt: string;
  signingSecretKey?: string;
  encryptionSecretKey?: string;
  encryptedSecrets?: EncryptedSecretsPayload;
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
const KEY_DERIVATION_BYTES = 32;

function identityPassphrase(): string | undefined {
  const passphrase = process.env['F0x_IDENTITY_PASSPHRASE'];
  if (!passphrase) return undefined;
  const trimmed = passphrase.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function encryptSecrets(passphrase: string, secrets: {
  signingSecretKey: string;
  encryptionSecretKey: string;
}): EncryptedSecretsPayload {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, KEY_DERIVATION_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(secrets), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    saltB64: salt.toString('base64'),
    ivB64: iv.toString('base64'),
    authTagB64: authTag.toString('base64'),
    ciphertextB64: ciphertext.toString('base64'),
    kdf: 'scrypt',
    cipher: 'aes-256-gcm'
  };
}

function decryptSecrets(passphrase: string, payload: EncryptedSecretsPayload): {
  signingSecretKey: string;
  encryptionSecretKey: string;
} {
  if (payload.kdf !== 'scrypt' || payload.cipher !== 'aes-256-gcm') {
    throw new Error('Unsupported identity encryption format. Expected scrypt + aes-256-gcm.');
  }
  const salt = Buffer.from(payload.saltB64, 'base64');
  const iv = Buffer.from(payload.ivB64, 'base64');
  const authTag = Buffer.from(payload.authTagB64, 'base64');
  const ciphertext = Buffer.from(payload.ciphertextB64, 'base64');
  const key = scryptSync(passphrase, salt, KEY_DERIVATION_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const parsed = JSON.parse(plaintext.toString('utf8')) as Partial<AgentIdentityFile>;
  if (typeof parsed.signingSecretKey !== 'string' || !parsed.signingSecretKey) {
    throw new Error('Decrypted identity payload missing signingSecretKey.');
  }
  if (typeof parsed.encryptionSecretKey !== 'string' || !parsed.encryptionSecretKey) {
    throw new Error('Decrypted identity payload missing encryptionSecretKey.');
  }
  return {
    signingSecretKey: parsed.signingSecretKey,
    encryptionSecretKey: parsed.encryptionSecretKey
  };
}

function encodeIdentityForDisk(identity: AgentIdentityFile): AgentIdentityDiskFile {
  const passphrase = identityPassphrase();
  const base: AgentIdentityDiskFile = {
    agentId: identity.agentId,
    label: identity.label,
    signingPublicKey: identity.signingPublicKey,
    encryptionPublicKey: identity.encryptionPublicKey,
    createdAt: identity.createdAt,
    updatedAt: identity.updatedAt
  };
  if (!passphrase) {
    return {
      ...base,
      signingSecretKey: identity.signingSecretKey,
      encryptionSecretKey: identity.encryptionSecretKey
    };
  }
  return {
    ...base,
    encryptedSecrets: encryptSecrets(passphrase, {
      signingSecretKey: identity.signingSecretKey,
      encryptionSecretKey: identity.encryptionSecretKey
    })
  };
}

function decodeIdentityFromDisk(file: AgentIdentityDiskFile): AgentIdentityFile {
  if (file.encryptedSecrets) {
    const passphrase = identityPassphrase();
    if (!passphrase) {
      throw new Error(
        'Identity file contains encrypted private keys. Set F0x_IDENTITY_PASSPHRASE to decrypt and continue.'
      );
    }
    const decrypted = decryptSecrets(passphrase, file.encryptedSecrets);
    return {
      agentId: file.agentId,
      label: file.label,
      signingPublicKey: file.signingPublicKey,
      signingSecretKey: decrypted.signingSecretKey,
      encryptionPublicKey: file.encryptionPublicKey,
      encryptionSecretKey: decrypted.encryptionSecretKey,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt
    };
  }
  if (!file.signingSecretKey || !file.encryptionSecretKey) {
    throw new Error('Identity file is missing private key material.');
  }
  return file as AgentIdentityFile;
}

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
    const loaded = decodeIdentityFromDisk(JSON.parse(readFileSync(identityPath, 'utf8')) as AgentIdentityDiskFile);
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

  writeFileSync(identityPath, JSON.stringify(encodeIdentityForDisk(identity), null, 2), { encoding: 'utf8', mode: FILE_MODE_600 });
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
  writeFileSync(identityPath, JSON.stringify(encodeIdentityForDisk(identity), null, 2), { encoding: 'utf8', mode: FILE_MODE_600 });
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
