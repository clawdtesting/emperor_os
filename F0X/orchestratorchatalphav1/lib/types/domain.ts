export type Base64 = string;

// ─── Agent identity (local, contains secret keys) ────────────────────────────

export interface AgentCapabilities {
  mcp?: boolean;
  sse?: boolean;
  attachments?: boolean;
  groupChat?: boolean;
}

export interface WalletBinding {
  namespace: string;   // e.g. "eip155:1"
  address: string;
  verifiedAt?: string;
  proofType?: string;  // e.g. "eip191", "eip712"
}

export interface AgentIdentity {
  agentId: string;
  label: string;
  displayName?: string;
  signingPublicKey: Base64;
  signingSecretKey: Base64;
  encryptionPublicKey: Base64;
  encryptionSecretKey: Base64;
  capabilities?: AgentCapabilities;
  walletBindings?: WalletBinding[];
  createdAt: string;
  updatedAt: string;
}

// ─── Agent profile (public, stored on relay) ─────────────────────────────────

export interface AgentProfile {
  agentId: string;
  label: string;
  displayName?: string;
  signingPublicKey: Base64;
  encryptionPublicKey: Base64;
  capabilities?: AgentCapabilities;
  createdAt: string;
  updatedAt: string;
}

// ─── Channel / key material ───────────────────────────────────────────────────

export interface WrappedChannelKey {
  wrapId: string;
  channelId: string;
  forAgentId: string;
  fromAgentId: string;
  nonceB64: Base64;
  wrappedKeyB64: Base64;
  createdAt: string;
}

export interface Channel {
  channelId: string;
  kind: 'dm';
  members: [string, string];
  wrappedKeys: WrappedChannelKey[];
  createdBy: string;
  createdAt: string;
}

// ─── Per-peer agent memory ────────────────────────────────────────────────────

export interface AgentMemory {
  myAgentId: string;
  peerAgentId: string;
  peerLabel: string;
  lastSeen: string;
  messageCount: number;
  summary: string;
  sharedFacts: string[];
  updatedAt: string;
}
