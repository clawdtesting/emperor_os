import type { AgentIdentity } from '@/lib/types/domain';
import type { AuthState } from '@/lib/types/protocol';

const AUTH_KEY='orches...auth';
const AGENT_KEY = 'orchestrator:v1:agent';

export function loadAuthState(): AuthState | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(AUTH_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AuthState;
  } catch {
    return null;
  }
}

export function persistAuthState(state: AuthState): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(AUTH_KEY, JSON.stringify(state));
}

export function loadAgentIdentity(): AgentIdentity | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(AGENT_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AgentIdentity;
  } catch {
    return null;
  }
}

export function persistAgentIdentity(identity: AgentIdentity | null): void {
  if (typeof window === 'undefined') return;
  if (identity === null) {
    window.localStorage.removeItem(AGENT_KEY);
  } else {
    window.localStorage.setItem(AGENT_KEY, JSON.stringify(identity));
  }
}