export interface StatusResponse {
  identity: { agentId: string; label: string };
  relayUrl: string;
  authenticated: boolean;
  relayHealth: { relay: string; timestamp: string; stats: { agents: number; channels: number; envelopes: number } } | null;
  adapterStatus: { hermes: 'available' | 'unavailable'; openclaw: 'available' | 'unavailable' };
  host: string;
  lastHeartbeat: string;
}

export interface AgentSummary {
  agentId: string;
  label: string;
  status: 'online' | 'unknown';
}

export interface ChannelSummary {
  channelId: string;
  peerId: string;
  peerLabel: string;
}

export interface ChatMessage {
  messageId: string;
  channelId: string;
  senderAgentId: string;
  senderLabel: string;
  timestamp: string;
  text: string;
  signatureValid: boolean;
  isMine: boolean;
}
