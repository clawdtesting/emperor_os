'use client';

import { useEffect, useState } from 'react';
import { WalletConnectCard } from '@/components/WalletConnectCard';
import { AgentIdentityCard } from '@/components/AgentIdentityCard';
import { ConversationPlaceholder } from '@/components/ConversationPlaceholder';
import { CRYPTO_STRATEGY } from '@/lib/crypto/strategy';
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

  useEffect(() => {
    const storedAuth = loadAuthState();
    const storedIdentity = loadAgentIdentity();

    if (storedAuth) setAuth(storedAuth);
    if (storedIdentity) setAgentIdentity(storedIdentity);
  }, []);

  const handleWalletConnected = (payload: { address: `0x${string}`; chainId: number; bootstrapSignature: string }) => {
    const nextAuth: AuthState = {
      wallet: {
        connected: true,
        walletAddress: payload.address,
        chainId: payload.chainId,
        bootstrapSignature: payload.bootstrapSignature
      },
      status: 'wallet_connected'
    };

    setAuth(nextAuth);
    persistAuthState(nextAuth);
  };

  const handleIdentityCreated = (identity: AgentIdentity) => {
    setAgentIdentity(identity);
    persistAgentIdentity(identity);

    const nextAuth: AuthState = {
      ...auth,
      agentIdentityId: identity.id,
      authenticatedAt: new Date().toISOString(),
      status: 'agent_ready'
    };

    setAuth(nextAuth);
    persistAuthState(nextAuth);
  };

  return (
    <main className="container">
      <header>
        <p className="eyebrow">Orchestrator Chat Alpha v1</p>
        <h1>Secure agent messaging foundation</h1>
        <p className="subtitle">
          Relay-first MVP scaffold for Hermes/OpenClaw style agent communication. No decentralization claims. No false encryption claims.
        </p>
      </header>

      <WalletConnectCard onConnected={handleWalletConnected} />

      {auth.wallet.connected && auth.wallet.walletAddress ? (
        <AgentIdentityCard walletAddress={auth.wallet.walletAddress} onCreated={handleIdentityCreated} />
      ) : null}

      {agentIdentity ? <ConversationPlaceholder agent={agentIdentity} /> : null}

      <section className="card muted">
        <h2>Crypto direction (Phase 2 implementation target)</h2>
        <ul>
          <li><strong>Wallet bootstrap:</strong> {CRYPTO_STRATEGY.wallet.signingPrimitive}</li>
          <li><strong>Agent signing:</strong> {CRYPTO_STRATEGY.agentSigning.primitive}</li>
          <li><strong>Agent encryption:</strong> {CRYPTO_STRATEGY.agentEncryption.primitive}</li>
          <li><strong>Envelope integrity:</strong> {CRYPTO_STRATEGY.envelopeIntegrity.primitive}</li>
        </ul>
      </section>
    </main>
  );
}
