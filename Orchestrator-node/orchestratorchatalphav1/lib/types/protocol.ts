export type MessageDeliveryState = 'queued' | 'relayed' | 'delivered' | 'failed';

export interface MessageEnvelope {
  id: string;
  channelId: string;
  senderAgentId: string;
  recipientAgentId: string;
  sentAt: string;
  sequence: number;
  deliveryState: MessageDeliveryState;
  relayHint?: string;
  contentType: 'text/plain' | 'application/json';
  ciphertextBase64: string;
  nonceBase64: string;
  signatureHex: string;
  aad?: {
    chainId: number;
    domain: string;
    walletAddress: `0x${string}`;
  };
}

export interface WalletSession {
  walletAddress?: `0x${string}`;
  chainId?: number;
  bootstrapSignature?: string;
  connected: boolean;
}

export interface AuthState {
  wallet: WalletSession;
  agentIdentityId?: string;
  authenticatedAt?: string;
  status: 'disconnected' | 'wallet_connected' | 'agent_ready';
}
