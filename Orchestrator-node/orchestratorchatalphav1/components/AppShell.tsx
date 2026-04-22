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

const defaultAuth: AuthState = {
  wallet: { connected: false },
  status: 'disconnected'
};

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

  const handleWalletConnected = (payload: {
    address: `0x${string}`;
    chainId: number;
    bootstrapSignature: string;
    relayToken: string;
    challengeNonce: string;
  }) => {
    const nextAuth: AuthState = {
      wallet: {
        connected: true,
        walletAddress: payload.address,
        chainId: payload.chainId,
        bootstrapSignature: payload.bootstrapSignature,
        relayToken: payload.relayToken,
        challengeNonce: payload.challengeNonce
      },
      status: 'wallet_connected'
    };

    setAuth(nextAuth);
    persistAuthState(nextAuth);
  };

  const handleWalletDisconnected = () => {
    const nextAuth: AuthState = {
      wallet: { connected: false },
      status: 'disconnected'
    };
    // Also clear agent identity when disconnecting wallet
    setAgentIdentity(null);
    persistAgentIdentity(null);
    setAuth(nextAuth);
    persistAuthState(nextAuth);
  };

  const handleIdentityCreated = (identity: AgentIdentity) => {
    setAgentIdentity(identity);
    persistAgentIdentity(identity);

    const nextAuth: AuthState = {
      ...auth,
      activeAgentId: identity.agentId,
      status: 'agent_ready'
    };

    setAuth(nextAuth);
    persistAuthState(nextAuth);
  };

  const walletStateLabel = auth.wallet.connected ? `Connected (${auth.wallet.walletAddress})` : 'Not connected';
  const agentStateLabel = agentIdentity ? `${agentIdentity.label} (${agentIdentity.agentId})` : 'Not initialized';
  const relayStateLabel = relayStatus === 'ok' ? 'Connected' : relayStatus === 'down' ? 'Unavailable' : 'Checking';

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
        <h1>Secure 1:1 agent messaging (relay-first)</h1>
        <p className="subtitle">
          Honest model: wallet authenticates session bootstrap, agent keys encrypt/sign messages, relay routes encrypted envelopes.
        </p>
      </header>

      <section className="card status-card">
        <h2>Operator status</h2>
        <p><strong>Relay:</strong> <span className={`pill ${relayStatus}`}>{relayStateLabel}</span> {relayMessage}</p>
        <p><strong>Wallet:</strong> {walletStateLabel}</p>
        <p><strong>Agent identity:</strong> {agentStateLabel}</p>
      </section>

      <WalletConnectCard 
        onConnected={handleWalletConnected}
        isConnected={auth.wallet.connected}
        onDisconnect={handleWalletDisconnected}
      />

      {auth.wallet.connected && auth.wallet.walletAddress && auth.wallet.relayToken ? (
        <AgentIdentityCard
          walletAddress={auth.wallet.walletAddress}
          relayToken={auth.wallet.relayToken}
          onCreated={handleIdentityCreated}
        />
      ) : null}

      {agentIdentity && auth.wallet.relayToken ? (
        <ConversationPlaceholder me={agentIdentity} relayToken={auth.wallet.relayToken} />
      ) : null}

      <section className="card muted">
        <h2>Security properties implemented</h2>
        <ul>
          <li><strong>Wallet bootstrap:</strong> {CRYPTO_STRATEGY.wallet.signingPrimitive}</li>
          <li><strong>Message signing:</strong> {CRYPTO_STRATEGY.agentSigning.primitive}</li>
          <li><strong>Message encryption:</strong> {CRYPTO_STRATEGY.agentEncryption.primitive}</li>
          <li><strong>Replay defense:</strong> {CRYPTO_STRATEGY.replayResistance.primitive}</li>
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