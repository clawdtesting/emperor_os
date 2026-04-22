import type { AgentProfile, Channel, WrappedChannelKey } from '@/lib/types/domain';
import type { MessageEnvelope } from '@/lib/types/protocol';

function withAuth(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

export async function fetchChallenge(wallet: `0x${string}`): Promise<{ message: string; nonce: string }> {
  const res = await fetch(`/api/relay/auth/challenge?wallet=${wallet}`);
  if (!res.ok) throw new Error('Unable to fetch wallet challenge from relay.');
  return (await res.json()) as { message: string; nonce: string };
}

export async function loginRelay(wallet: `0x${string}`, signature: string): Promise<{ token: string }> {
  const res = await fetch('/api/relay/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet, signature })
  });

  const body = (await res.json()) as { token?: string; error?: string };
  if (!res.ok || !body.token) throw new Error(body.error ?? 'Relay login failed.');
  return { token: body.token };
}

export async function registerAgent(token: string, profile: AgentProfile): Promise<void> {
  const res = await fetch('/api/relay/agents/register', {
    method: 'POST',
    headers: withAuth(token),
    body: JSON.stringify(profile)
  });

  if (!res.ok) {
    const body = (await res.json()) as { error?: string };
    throw new Error(body.error ?? 'Failed to register agent on relay.');
  }
}

export async function listAgents(token: string): Promise<AgentProfile[]> {
  const res = await fetch('/api/relay/agents', { headers: withAuth(token) });
  const body = (await res.json()) as { agents?: AgentProfile[]; error?: string };
  if (!res.ok || !body.agents) throw new Error(body.error ?? 'Unable to load agents.');
  return body.agents;
}

export async function openDmChannel(input: {
  token: string;
  creatorAgentId: string;
  targetAgentId: string;
  wrappedKeys: WrappedChannelKey[];
}): Promise<{ channel: Channel; existed: boolean }> {
  const res = await fetch('/api/relay/channels/open', {
    method: 'POST',
    headers: withAuth(input.token),
    body: JSON.stringify(input)
  });

  const body = (await res.json()) as { channel?: Channel; existed?: boolean; error?: string };
  if (!res.ok || !body.channel) throw new Error(body.error ?? 'Unable to create/open channel.');
  return { channel: body.channel, existed: Boolean(body.existed) };
}

export async function listMyChannels(token: string): Promise<Channel[]> {
  const res = await fetch('/api/relay/channels', { headers: withAuth(token) });
  const body = (await res.json()) as { channels?: Channel[]; error?: string };
  if (!res.ok || !body.channels) throw new Error(body.error ?? 'Unable to fetch channels.');
  return body.channels;
}

export async function sendEnvelope(token: string, channelId: string, envelope: MessageEnvelope): Promise<void> {
  const res = await fetch(`/api/relay/channels/${channelId}/messages`, {
    method: 'POST',
    headers: withAuth(token),
    body: JSON.stringify(envelope)
  });

  if (!res.ok) {
    const body = (await res.json()) as { error?: string };
    throw new Error(body.error ?? 'Relay rejected message envelope.');
  }
}

export async function fetchEnvelopes(token: string, channelId: string): Promise<{ channel: Channel; messages: MessageEnvelope[] }> {
  const res = await fetch(`/api/relay/channels/${channelId}/messages`, { headers: withAuth(token) });
  const body = (await res.json()) as { channel?: Channel; messages?: MessageEnvelope[]; error?: string };

  if (!res.ok || !body.channel || !body.messages) {
    throw new Error(body.error ?? 'Unable to load encrypted envelopes.');
  }

  return { channel: body.channel, messages: body.messages };
}
