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

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
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

// ─── Identity ─────────────────────────────────────────────────────────────────

export function loadOrCreateIdentity(identityDir: string, defaultLabel = 'hermes-agent'): AgentIdentityFile {
  mkdirSync(identityDir, { recursive: true });
  const identityPath = resolveIdentityPath(identityDir);

  if (existsSync(identityPath)) {
    return JSON.parse(readFileSync(identityPath, 'utf8')) as AgentIdentityFile;
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

  writeFileSync(identityPath, JSON.stringify(identity, null, 2), 'utf8');
  return identity;
}

export function saveIdentity(identityDir: string, identity: AgentIdentityFile): void {
  mkdirSync(identityDir, { recursive: true });
  identity.updatedAt = new Date().toISOString();
  writeFileSync(resolveIdentityPath(identityDir), JSON.stringify(identity, null, 2), 'utf8');
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
