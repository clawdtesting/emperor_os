'use client';

import { useEffect, useMemo, useState } from 'react';
import { WalletConnectCard } from '@/components/WalletConnectCard';
import { AgentIdentityCard } from '@/components/AgentIdentityCard';
import { ConversationPlaceholder } from '@/components/ConversationPlaceholder';
import { CRYPTO_STRATEGY } from '@/lib/crypto/strategy';
import { checkRelayHealth } from '@/lib/client/relay-api';
import { loadAgentIdentity, loadAuthState, persistAgentIdentity, persistAuthState } from '@/lib/state/session';
import type { AgentIdentity } from '@/lib/types/domain';
import type { AuthState } from '@/lib/types/protocol';

const defaultAuth: AuthState = { status: 'disconnected' };

export function AppShell() {
  const [auth, setAuth] = useState<AuthState>(defaultAuth);
  const [agentIdentity, setAgentIdentity] = useState<AgentIdentity | null>(null);
  const [relayStatus, setRelayStatus] = useState<'unknown' | 'ok' | 'down'>('unknown');
  const [relayMessage, setRelayMessage] = useState('Checking relay health...');

  useEffect(() => {
    const storedAuth = loadAuthState();
    const storedIdentity = loadAgentIdentity();
    if (storedAuth) setAuth(storedAuth);
    if (storedIdentity) setAgentIdentity(storedIdentity);
  }, []);

  useEffect(() => {
    let active = true;

    const pollRelay = async () => {
      try {
        const health = await checkRelayHealth();
        if (!active) return;
        setRelayStatus(health.relay === 'ok' ? 'ok' : 'down');
        setRelayMessage(`Relay reachable · agents ${health.stats.agents} · channels ${health.stats.channels} · envelopes ${health.stats.envelopes}`);
      } catch {
        if (!active) return;
        setRelayStatus('down');
        setRelayMessage('Relay endpoint unavailable. Messaging cannot function until relay is reachable.');
      }
    };

    void pollRelay();
    const interval = setInterval(() => void pollRelay(), 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const handleIdentityCreated = (identity: AgentIdentity) => {
    setAgentIdentity(identity);
    persistAgentIdentity(identity);
    // Clear any existing relay token since new identity needs fresh login
    const nextAuth: AuthState = { status: 'disconnected' };
    setAuth(nextAuth);
    persistAuthState(nextAuth);
  };

  const handleRelayConnected = (token: string) => {
    if (!agentIdentity) return;
    const nextAuth: AuthState = {
      status: 'agent_ready',
      agentId: agentIdentity.agentId,
      relayToken: token
    };
    setAuth(nextAuth);
    persistAuthState(nextAuth);
  };

  const handleDisconnect = () => {
    const nextAuth: AuthState = { status: 'disconnected' };
    setAuth(nextAuth);
    persistAuthState(nextAuth);
  };

  const handleReset = () => {
    setAgentIdentity(null);
    persistAgentIdentity(null);
    const nextAuth: AuthState = { status: 'disconnected' };
    setAuth(nextAuth);
    persistAuthState(nextAuth);
  };

  const agentStateLabel = agentIdentity
    ? `${agentIdentity.label} (${agentIdentity.agentId.slice(0, 8)}…)`
    : 'Not initialized';

  const relayStateLabel =
    relayStatus === 'ok' ? 'Connected' : relayStatus === 'down' ? 'Unavailable' : 'Checking';

  const truthLines = useMemo(
    () => [
      'Private means message content is encrypted before relay storage.',
      'Not guaranteed: metadata privacy from relay (sender/channel/timestamps are visible to relay).',
      'Not guaranteed: hardware-backed key custody or multi-device recovery in this MVP.'
    ],
    []
  );

  return (
    <main className="container">
      <header>
        <p className="eyebrow">Orchestrator Chat Alpha v1 · Phase 3 Hardened MVP</p>
        <h1>Secure agent messaging (relay-first)</h1>
        <p className="subtitle">
          No wallet required. Agent Ed25519 keypair authenticates the relay session and signs every message.
        </p>
      </header>

      <section className="card status-card">
        <h2>Operator status</h2>
        <p><strong>Relay:</strong> <span className={`pill ${relayStatus}`}>{relayStateLabel}</span> {relayMessage}</p>
        <p><strong>Agent identity:</strong> {agentStateLabel}</p>
        <p><strong>Session:</strong> {auth.status === 'agent_ready' ? 'Authenticated' : 'Not connected'}</p>
        {agentIdentity ? (
          <button className="button ghost" onClick={handleReset} style={{ marginTop: '0.5rem' }}>
            Reset identity
          </button>
        ) : null}
      </section>

      {!agentIdentity ? (
        <AgentIdentityCard onCreated={handleIdentityCreated} />
      ) : null}

      {agentIdentity ? (
        <WalletConnectCard
          identity={agentIdentity}
          isConnected={auth.status === 'agent_ready'}
          onConnected={handleRelayConnected}
          onDisconnect={handleDisconnect}
        />
      ) : null}

      {agentIdentity && auth.status === 'agent_ready' && auth.relayToken ? (
        <ConversationPlaceholder me={agentIdentity} relayToken={auth.relayToken} />
      ) : null}

      <section className="card muted">
        <h2>Security properties implemented</h2>
        <ul>
          <li><strong>Agent bootstrap:</strong> {CRYPTO_STRATEGY.agentBootstrap.signingPrimitive}</li>
          <li><strong>Message signing:</strong> {CRYPTO_STRATEGY.agentSigning.primitive}</li>
          <li><strong>Message encryption:</strong> {CRYPTO_STRATEGY.agentEncryption.primitive}</li>
          <li><strong>Replay defense:</strong> {CRYPTO_STRATEGY.replayResistance.primitive}</li>
          <li><strong>Agent memory:</strong> {CRYPTO_STRATEGY.agentMemory.primitive}</li>
        </ul>
      </section>

      <section className="card muted">
        <h2>Truth and limits</h2>
        <ul>
          {truthLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
