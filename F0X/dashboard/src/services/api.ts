import type { AgentSummary, ChannelSummary, ChatMessage, StatusResponse } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function login(identityJson: string, label?: string, mode: 'upload' | 'generate' = 'upload') {
  return request<{ ok: true }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identityJson, label, mode })
  });
}

export function getStatus() {
  return request<StatusResponse>('/api/f0x/status');
}

export function getAgents() {
  return request<AgentSummary[]>('/api/f0x/agents');
}

export function getChannels() {
  return request<ChannelSummary[]>('/api/f0x/channels');
}

export function getMessages(channelId: string) {
  return request<ChatMessage[]>(`/api/f0x/messages/${encodeURIComponent(channelId)}`);
}

export function sendMessage(channelId: string, content: string) {
  return request<{ messageId: string }>(`/api/f0x/send`, {
    method: 'POST',
    body: JSON.stringify({ channelId, content })
  });
}
