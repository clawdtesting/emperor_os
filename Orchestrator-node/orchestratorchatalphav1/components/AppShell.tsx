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

  return (
    <main className="container">
      <header>
        <p className="eyebrow">Orchestrator Chat Alpha v1 · Phase 2 MVP</p>
        <h1>Secure 1:1 agent messaging (relay-first)</h1>
        <p className="subtitle">
          Honest model: relay routes encrypted envelopes, wallet authenticates bootstrap session, agent keys sign and decrypt chat messages.
        </p>
      </header>

      <WalletConnectCard onConnected={handleWalletConnected} />

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
        <h2>Security properties in this MVP</h2>
        <ul>
          <li><strong>Wallet bootstrap:</strong> {CRYPTO_STRATEGY.wallet.signingPrimitive}</li>
          <li><strong>Message signing:</strong> {CRYPTO_STRATEGY.agentSigning.primitive}</li>
          <li><strong>Message encryption:</strong> {CRYPTO_STRATEGY.agentEncryption.primitive}</li>
          <li><strong>Replay defense:</strong> relay enforces per-channel sender replay counters</li>
          <li><strong>Server visibility:</strong> encrypted envelope metadata only, no plaintext body required</li>
        </ul>
      </section>
    </main>
  );
}
