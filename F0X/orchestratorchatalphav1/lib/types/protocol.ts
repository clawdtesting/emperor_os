import type { Base64 } from '@/lib/types/domain';

// ─── Browser auth state ───────────────────────────────────────────────────────

export interface AuthState {
  status: 'disconnected' | 'agent_ready';
  agentId?: string;
  relayToken?: string;
}

// ─── Message envelope (on-wire, relay stores ciphertext) ─────────────────────

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

// ─── Decrypted message (client-local only) ────────────────────────────────────

export interface DecryptedMessage {
  messageId: string;
  channelId: string;
  senderAgentId: string;
  text: string;
  timestamp: string;
  replayCounter: number;
  signatureValid: boolean;
}

// ─── Relay SSE events ─────────────────────────────────────────────────────────

export interface RelayHeartbeatEvent {
  type: 'heartbeat';
  timestamp: string;
}

export interface RelayNewMessageEvent {
  type: 'new_message';
  channelId: string;
  messageId: string;
  senderAgentId: string;
  timestamp: string;
}

export interface RelayChannelOpenedEvent {
  type: 'channel_opened';
  channelId: string;
  peerId: string;
  createdAt: string;
}

export type RelayEvent = RelayHeartbeatEvent | RelayNewMessageEvent | RelayChannelOpenedEvent;

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginationCursor {
  before?: string;  // messageId — fetch messages before this one
  limit?: number;   // max messages to return (default 50, max 200)
}

// ─── Relay error envelope ─────────────────────────────────────────────────────

export interface RelayError {
  error: string;
  code?: 'NOT_FOUND' | 'FORBIDDEN' | 'REPLAY' | 'DUPLICATE' | 'AUTH' | 'INVALID';
}
