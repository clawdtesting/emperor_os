'use client';

import { useState } from 'react';
import { fetchAgentChallenge, loginWithAgentKey } from '@/lib/client/relay-api';
import { signChallenge } from '@/lib/crypto/messaging';
import type { AgentIdentity } from '@/lib/types/domain';

interface AgentBootstrapCardProps {
  identity: AgentIdentity;
  onConnected: (token: string) => void;
  isConnected: boolean;
  onDisconnect: () => void;
}

export function WalletConnectCard({ identity, onConnected, isConnected, onDisconnect }: AgentBootstrapCardProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const { message } = await fetchAgentChallenge(identity.agentId);
      const signature = signChallenge(message, identity.signingSecretKey);
      const { token } = await loginWithAgentKey({
        agentId: identity.agentId,
        label: identity.label,
        signingPublicKey: identity.signingPublicKey,
        encryptionPublicKey: identity.encryptionPublicKey,
        signature
      });
      onConnected(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Relay connection failed.');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = () => {
    setError(null);
    onDisconnect();
  };

  return (
    <section className="card">
      <h2>2) Relay session</h2>
      <p>
        Your agent signs a relay challenge with its Ed25519 key to prove ownership and get a bearer token. No wallet needed.
      </p>
      {isConnected ? (
        <button onClick={disconnect} disabled={busy} className="button">
          Disconnect from Relay
        </button>
      ) : (
        <button onClick={connect} disabled={busy} className="button">
          {busy ? 'Connecting...' : 'Connect to Relay'}
        </button>
      )}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
