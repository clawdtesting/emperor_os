/**
 * HTTP client for the Orchestrator Chat relay API.
 * All methods correspond 1:1 to relay API routes.
 */

export interface RelayClientOptions {
  relayUrl: string;   // e.g. "http://localhost:3000"
  token?: string;     // bearer token (set after login)
}

export interface AgentProfile {
  agentId: string;
  label: string;
  displayName?: string;
  signingPublicKey: string;
  encryptionPublicKey: string;
  capabilities?: Record<string, boolean>;
  createdAt: string;
  updatedAt: string;
}

export interface WrappedChannelKey {
  wrapId: string;
  channelId: string;
  forAgentId: string;
  fromAgentId: string;
  nonceB64: string;
  wrappedKeyB64: string;
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

export interface MessageEnvelope {
  messageId: string;
  channelId: string;
  senderAgentId: string;
  timestamp: string;
  replayCounter: number;
  nonceB64: string;
  ciphertextB64: string;
  signatureB64: string;
}

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

export class RelayClient {
  private baseUrl: string;
  public token: string | undefined;

  constructor(opts: RelayClientOptions) {
    this.baseUrl = opts.relayUrl.replace(/\/$/, '');
    this.token = opts.token;
  }

  private authHeaders(): Record<string, string> {
    if (!this.token) throw new Error('Not authenticated. Call login() first.');
    return { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' };
  }

  private async json<T>(res: Response): Promise<T> {
    let body: T & { error?: string };
    try {
      body = (await res.json()) as T & { error?: string };
    } catch {
      throw new Error(`Relay at ${this.baseUrl} returned non-JSON (HTTP ${res.status}) — is the relay running?`);
    }
    if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
    return body;
  }

  // ─── Auth ───────────────────────────────────────────────────────────────────

  async getChallenge(agentId: string): Promise<{ nonce: string; message: string }> {
    const res = await fetch(`${this.baseUrl}/api/relay/auth/challenge?agentId=${encodeURIComponent(agentId)}`);
    return this.json(res);
  }

  async login(params: {
    agentId: string;
    label: string;
    signingPublicKey: string;
    encryptionPublicKey: string;
    signature: string;
    capabilities?: Record<string, boolean>;
  }): Promise<{ token: string }> {
    const res = await fetch(`${this.baseUrl}/api/relay/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    const result = await this.json<{ token: string }>(res);
    this.token = result.token;
    return result;
  }

  // ─── Agents ─────────────────────────────────────────────────────────────────

  async listAgents(): Promise<AgentProfile[]> {
    const res = await fetch(`${this.baseUrl}/api/relay/agents`, { headers: this.authHeaders() });
    const body = await this.json<{ agents: AgentProfile[] }>(res);
    return body.agents;
  }

  // ─── Channels ───────────────────────────────────────────────────────────────

  async openDmChannel(params: {
    creatorAgentId: string;
    targetAgentId: string;
    wrappedKeys: WrappedChannelKey[];
  }): Promise<{ channel: Channel; existed: boolean }> {
    const res = await fetch(`${this.baseUrl}/api/relay/channels/open`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(params)
    });
    return this.json(res);
  }

  async listChannels(): Promise<Channel[]> {
    const res = await fetch(`${this.baseUrl}/api/relay/channels`, { headers: this.authHeaders() });
    const body = await this.json<{ channels: Channel[] }>(res);
    return body.channels;
  }

  // ─── Messages ───────────────────────────────────────────────────────────────

  async sendMessage(channelId: string, envelope: MessageEnvelope): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/relay/channels/${channelId}/messages`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(envelope)
    });
    await this.json(res);
  }

  async listMessages(
    channelId: string,
    opts: { limit?: number; before?: string } = {}
  ): Promise<{ channel: Channel; messages: MessageEnvelope[] }> {
    const params = new URLSearchParams();
    if (opts.limit) params.set('limit', String(opts.limit));
    if (opts.before) params.set('before', opts.before);
    const qs = params.toString() ? `?${params}` : '';
    const res = await fetch(`${this.baseUrl}/api/relay/channels/${channelId}/messages${qs}`, {
      headers: this.authHeaders()
    });
    return this.json(res);
  }

  // ─── Memory ─────────────────────────────────────────────────────────────────

  async getMemory(peerId: string): Promise<AgentMemory | null> {
    const res = await fetch(`${this.baseUrl}/api/relay/peer-ctx/${peerId}`, { headers: this.authHeaders() });
    const body = await this.json<{ memory: AgentMemory | null }>(res);
    return body.memory;
  }

  async setMemory(peerId: string, update: Partial<AgentMemory>): Promise<AgentMemory> {
    const res = await fetch(`${this.baseUrl}/api/relay/peer-ctx/${peerId}`, {
      method: 'PUT',
      headers: this.authHeaders(),
      body: JSON.stringify(update)
    });
    const body = await this.json<{ memory: AgentMemory }>(res);
    return body.memory;
  }

  // ─── SSE event stream ────────────────────────────────────────────────────────

  sseUrl(): string {
    if (!this.token) throw new Error('Not authenticated.');
    return `${this.baseUrl}/api/relay/events?token=${encodeURIComponent(this.token)}`;
  }

  // ─── Health ──────────────────────────────────────────────────────────────────

  async health(): Promise<{ relay: string; timestamp: string; stats: { agents: number; channels: number; envelopes: number } }> {
    const res = await fetch(`${this.baseUrl}/api/relay/health`);
    return this.json(res);
  }
}
