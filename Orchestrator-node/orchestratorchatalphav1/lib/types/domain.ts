export type AgentStatus = 'draft' | 'active' | 'revoked';

export interface AgentIdentity {
  id: string;
  label: string;
  walletAddress: `0x${string}`;
  encryptionPublicKey: string;
  signingPublicKey: string;
  keyVersion: number;
  createdAt: string;
  status: AgentStatus;
}

export type ChannelType = 'dm' | 'relay-room';

export interface Channel {
  id: string;
  type: ChannelType;
  participantAgentIds: string[];
  wrappedKeyIds: string[];
  createdAt: string;
  lastMessageAt?: string;
}

export interface WrappedChannelKey {
  id: string;
  channelId: string;
  recipientAgentId: string;
  algorithm: 'x25519-xsalsa20-poly1305';
  wrappedKeyBase64: string;
  nonceBase64: string;
  createdAt: string;
}
