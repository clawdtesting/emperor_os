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

export class RelayAuthError extends Error {
  status: 401 | 403;

  constructor(status: 401 | 403, message?: string) {
    super(message ?? `HTTP ${status}`);
    this.status = status;
    this.name = 'RelayAuthError';
  }
}

export class RelayRateLimitError extends Error {
  retryAfterSeconds?: number;

  constructor(message: string, retryAfterSeconds?: number) {
    super(message);
    this.retryAfterSeconds = retryAfterSeconds;
    this.name = 'RelayRateLimitError';
  }
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

  private asRecord(value: unknown, context: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error(`Malformed relay response for ${context}: expected JSON object.`);
    }
    return value as Record<string, unknown>;
  }

  private expectString(value: unknown, field: string, context: string): string {
    if (typeof value !== 'string' || !value) {
      throw new Error(`Malformed relay response for ${context}: field "${field}" must be a non-empty string.`);
    }
    return value;
  }

  private expectNumber(value: unknown, field: string, context: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Malformed relay response for ${context}: field "${field}" must be a finite number.`);
    }
    return value;
  }

  private expectBoolean(value: unknown, field: string, context: string): boolean {
    if (typeof value !== 'boolean') {
      throw new Error(`Malformed relay response for ${context}: field "${field}" must be a boolean.`);
    }
    return value;
  }

  private async json<T>(res: Response): Promise<T> {
    let body: T & { error?: string };
    try {
      body = (await res.json()) as T & { error?: string };
    } catch {
      throw new Error(`Relay at ${this.baseUrl} returned non-JSON (HTTP ${res.status}) — is the relay running?`);
    }
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new RelayAuthError(res.status, (body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      if (res.status === 429) {
        const retryAfterRaw = res.headers.get('retry-after');
        const retryAfterSeconds = retryAfterRaw ? Number.parseInt(retryAfterRaw, 10) : undefined;
        throw new RelayRateLimitError((body as { error?: string }).error ?? 'HTTP 429', Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined);
      }
      throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
    }
    return body;
  }

  // ─── Auth ───────────────────────────────────────────────────────────────────

  async getChallenge(agentId: string): Promise<{ nonce: string; message: string }> {
    const res = await fetch(`${this.baseUrl}/api/relay/auth/challenge?agentId=${encodeURIComponent(agentId)}`);
    const body = this.asRecord(await this.json<unknown>(res), 'getChallenge');
    return {
      nonce: this.expectString(body['nonce'], 'nonce', 'getChallenge'),
      message: this.expectString(body['message'], 'message', 'getChallenge')
    };
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
    const body = this.asRecord(await this.json<unknown>(res), 'login');
    const token = this.expectString(body['token'], 'token', 'login');
    this.token = token;
    return { token };
  }

  // ─── Agents ─────────────────────────────────────────────────────────────────

  async getAgent(agentId: string): Promise<AgentProfile | null> {
    const res = await fetch(`${this.baseUrl}/api/relay/agents?agentId=${encodeURIComponent(agentId)}`, { headers: this.authHeaders() });
    if (res.status === 404) return null;
    const body = this.asRecord(await this.json<unknown>(res), 'getAgent');
    const agent = this.asRecord(body['agent'], 'getAgent.agent');
    return {
      agentId: this.expectString(agent['agentId'], 'agentId', 'getAgent.agent'),
      label: this.expectString(agent['label'], 'label', 'getAgent.agent'),
      signingPublicKey: this.expectString(agent['signingPublicKey'], 'signingPublicKey', 'getAgent.agent'),
      encryptionPublicKey: this.expectString(agent['encryptionPublicKey'], 'encryptionPublicKey', 'getAgent.agent'),
      createdAt: this.expectString(agent['createdAt'], 'createdAt', 'getAgent.agent'),
      updatedAt: this.expectString(agent['updatedAt'], 'updatedAt', 'getAgent.agent'),
      capabilities: typeof agent['capabilities'] === 'object' && agent['capabilities'] !== null ? agent['capabilities'] as Record<string, boolean> : undefined,
      displayName: typeof agent['displayName'] === 'string' ? agent['displayName'] : undefined
    };
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
    const body = this.asRecord(await this.json<unknown>(res), 'openDmChannel');
    return {
      channel: this.parseChannel(body['channel'], 'openDmChannel.channel'),
      existed: this.expectBoolean(body['existed'], 'existed', 'openDmChannel')
    };
  }

  async listChannels(): Promise<Channel[]> {
    const res = await fetch(`${this.baseUrl}/api/relay/channels`, { headers: this.authHeaders() });
    const body = this.asRecord(await this.json<unknown>(res), 'listChannels');
    if (!Array.isArray(body['channels'])) throw new Error('Malformed relay response for listChannels: channels must be an array.');
    return body['channels'].map((c, i) => this.parseChannel(c, `listChannels.channels[${i}]`));
  }

  // ─── Messages ───────────────────────────────────────────────────────────────

  async sendMessage(channelId: string, envelope: MessageEnvelope): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/relay/channels/${channelId}/messages`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(envelope)
    });
    await this.json<unknown>(res);
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
    const body = this.asRecord(await this.json<unknown>(res), 'listMessages');
    const channel = this.parseChannel(body['channel'], 'listMessages.channel');
    if (!Array.isArray(body['messages'])) throw new Error('Malformed relay response for listMessages: messages must be an array.');
    const messages = body['messages'].map((m, i) => this.parseEnvelope(m, `listMessages.messages[${i}]`));
    return { channel, messages };
  }

  // ─── Memory ─────────────────────────────────────────────────────────────────

  async getMemory(peerId: string): Promise<AgentMemory | null> {
    const res = await fetch(`${this.baseUrl}/api/relay/peer-ctx/${peerId}`, { headers: this.authHeaders() });
    const body = this.asRecord(await this.json<unknown>(res), 'getMemory');
    if (body['memory'] === null) return null;
    return this.parseMemory(body['memory'], 'getMemory.memory');
  }

  async setMemory(peerId: string, update: Partial<AgentMemory>): Promise<AgentMemory> {
    const res = await fetch(`${this.baseUrl}/api/relay/peer-ctx/${peerId}`, {
      method: 'PUT',
      headers: this.authHeaders(),
      body: JSON.stringify(update)
    });
    const body = this.asRecord(await this.json<unknown>(res), 'setMemory');
    return this.parseMemory(body['memory'], 'setMemory.memory');
  }

  // ─── SSE event stream ────────────────────────────────────────────────────────

  sseUrl(): string {
    if (!this.token) throw new Error('Not authenticated.');
    return `${this.baseUrl}/api/relay/events?token=${encodeURIComponent(this.token)}`;
  }

  // ─── Health ──────────────────────────────────────────────────────────────────

  async health(): Promise<{ relay: string; timestamp: string; stats: { agents: number; channels: number; envelopes: number } }> {
    const res = await fetch(`${this.baseUrl}/api/relay/health`);
    const body = this.asRecord(await this.json<unknown>(res), 'health');
    const stats = this.asRecord(body['stats'], 'health.stats');
    return {
      relay: this.expectString(body['relay'], 'relay', 'health'),
      timestamp: this.expectString(body['timestamp'], 'timestamp', 'health'),
      stats: {
        agents: this.expectNumber(stats['agents'], 'agents', 'health.stats'),
        channels: this.expectNumber(stats['channels'], 'channels', 'health.stats'),
        envelopes: this.expectNumber(stats['envelopes'], 'envelopes', 'health.stats')
      }
    };
  }

  private parseChannel(value: unknown, context: string): Channel {
    const channel = this.asRecord(value, context);
    const members = channel['members'];
    if (!Array.isArray(members) || members.length !== 2) throw new Error(`Malformed relay response for ${context}: members must have exactly 2 entries.`);
    const m0 = this.expectString(members[0], 'members[0]', context);
    const m1 = this.expectString(members[1], 'members[1]', context);
    const wrappedKeysRaw = channel['wrappedKeys'];
    if (!Array.isArray(wrappedKeysRaw)) throw new Error(`Malformed relay response for ${context}: wrappedKeys must be an array.`);
    return {
      channelId: this.expectString(channel['channelId'], 'channelId', context),
      kind: this.expectString(channel['kind'], 'kind', context) as 'dm',
      members: [m0, m1],
      createdBy: this.expectString(channel['createdBy'], 'createdBy', context),
      createdAt: this.expectString(channel['createdAt'], 'createdAt', context),
      wrappedKeys: wrappedKeysRaw.map((w, i) => this.parseWrappedKey(w, `${context}.wrappedKeys[${i}]`))
    };
  }

  private parseWrappedKey(value: unknown, context: string): WrappedChannelKey {
    const wk = this.asRecord(value, context);
    return {
      wrapId: this.expectString(wk['wrapId'], 'wrapId', context),
      channelId: this.expectString(wk['channelId'], 'channelId', context),
      forAgentId: this.expectString(wk['forAgentId'], 'forAgentId', context),
      fromAgentId: this.expectString(wk['fromAgentId'], 'fromAgentId', context),
      nonceB64: this.expectString(wk['nonceB64'], 'nonceB64', context),
      wrappedKeyB64: this.expectString(wk['wrappedKeyB64'], 'wrappedKeyB64', context),
      createdAt: this.expectString(wk['createdAt'], 'createdAt', context)
    };
  }

  private parseEnvelope(value: unknown, context: string): MessageEnvelope {
    const e = this.asRecord(value, context);
    const replayCounter = this.expectNumber(e['replayCounter'], 'replayCounter', context);
    if (!Number.isInteger(replayCounter) || replayCounter < 0) {
      throw new Error(`Malformed relay response for ${context}: replayCounter must be a non-negative integer.`);
    }
    return {
      messageId: this.expectString(e['messageId'], 'messageId', context),
      channelId: this.expectString(e['channelId'], 'channelId', context),
      senderAgentId: this.expectString(e['senderAgentId'], 'senderAgentId', context),
      timestamp: this.expectString(e['timestamp'], 'timestamp', context),
      replayCounter,
      nonceB64: this.expectString(e['nonceB64'], 'nonceB64', context),
      ciphertextB64: this.expectString(e['ciphertextB64'], 'ciphertextB64', context),
      signatureB64: this.expectString(e['signatureB64'], 'signatureB64', context)
    };
  }

  private parseMemory(value: unknown, context: string): AgentMemory {
    const memory = this.asRecord(value, context);
    const sharedFacts = memory['sharedFacts'];
    if (!Array.isArray(sharedFacts) || sharedFacts.some((f) => typeof f !== 'string')) {
      throw new Error(`Malformed relay response for ${context}: sharedFacts must be a string array.`);
    }
    return {
      myAgentId: this.expectString(memory['myAgentId'], 'myAgentId', context),
      peerAgentId: this.expectString(memory['peerAgentId'], 'peerAgentId', context),
      peerLabel: this.expectString(memory['peerLabel'], 'peerLabel', context),
      lastSeen: this.expectString(memory['lastSeen'], 'lastSeen', context),
      messageCount: this.expectNumber(memory['messageCount'], 'messageCount', context),
      summary: this.expectString(memory['summary'], 'summary', context),
      sharedFacts,
      updatedAt: this.expectString(memory['updatedAt'], 'updatedAt', context)
    };
  }
}
