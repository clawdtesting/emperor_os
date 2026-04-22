export type Base64 = string;

export interface AgentIdentity {
  agentId: string;
  ownerWallet: `0x${string}`;
  label: string;
  signingPublicKey: Base64;
  signingSecretKey: Base64;
  encryptionPublicKey: Base64;
  encryptionSecretKey: Base64;
  createdAt: string;
}

export interface AgentProfile {
  agentId: string;
  ownerWallet: `0x${string}`;
  label: string;
  signingPublicKey: Base64;
  encryptionPublicKey: Base64;
  createdAt: string;
}

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
