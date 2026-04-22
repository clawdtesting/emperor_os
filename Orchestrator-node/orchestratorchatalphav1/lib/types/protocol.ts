import type { Base64 } from '@/lib/types/domain';

export interface WalletSession {
  connected: boolean;
  walletAddress?: `0x${string}`;
  chainId?: number;
  challengeNonce?: string;
  bootstrapSignature?: string;
  relayToken?: string;
}

export interface AuthState {
  status: 'disconnected' | 'wallet_connected' | 'agent_ready';
  wallet: WalletSession;
  activeAgentId?: string;
}

export interface MessageEnvelope {
  messageId: string;
  channelId: string;
  senderAgentId: string;
  timestamp: string;
  replayCounter: number;
  nonceB64: Base64;
  ciphertextB64: Base64;
  signatureB64: Base64;
}

export interface DecryptedMessage {
  messageId: string;
  channelId: string;
  senderAgentId: string;
  text: string;
  timestamp: string;
  replayCounter: number;
  signatureValid: boolean;
}
