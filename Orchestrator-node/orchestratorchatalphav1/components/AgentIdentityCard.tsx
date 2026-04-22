'use client';

import { useState } from 'react';
import { registerAgent } from '@/lib/client/relay-api';
import { createAgentIdentity, toAgentProfile } from '@/lib/crypto/messaging';
import type { AgentIdentity } from '@/lib/types/domain';

interface AgentIdentityCardProps {
  walletAddress: `0x${string}`;
  relayToken: string;
  onCreated: (agent: AgentIdentity) => void;
}

export function AgentIdentityCard({ walletAddress, relayToken, onCreated }: AgentIdentityCardProps) {
  const [label, setLabel] = useState('Hermes-Local');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createIdentity = async () => {
    try {
      setBusy(true);
      setError(null);
      const identity = createAgentIdentity(walletAddress, label.trim() || 'Agent');
      await registerAgent(relayToken, toAgentProfile(identity));
      onCreated(identity);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Agent initialization failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2>2) Agent identity init</h2>
      <p>
        Creates persistent local Ed25519 signing + X25519 encryption keypairs. Public keys are registered with relay.
      </p>
      <label className="label">
        Agent label
        <input value={label} onChange={(event) => setLabel(event.target.value)} className="input" disabled={busy} />
      </label>
      <button className="button" onClick={createIdentity} disabled={busy}>
        {busy ? 'Initializing...' : 'Initialize Agent Identity'}
      </button>
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
