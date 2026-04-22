'use client';

import { useState } from 'react';
import { createAgentIdentity } from '@/lib/crypto/messaging';
import type { AgentIdentity } from '@/lib/types/domain';

interface AgentIdentityCardProps {
  onCreated: (agent: AgentIdentity) => void;
}

export function AgentIdentityCard({ onCreated }: AgentIdentityCardProps) {
  const [label, setLabel] = useState('Hermes-Local');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createIdentity = async () => {
    try {
      setBusy(true);
      setError(null);
      const identity = createAgentIdentity(label.trim() || 'Agent');
      onCreated(identity);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Agent initialization failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2>1) Agent identity</h2>
      <p>
        Creates Ed25519 signing + X25519 encryption keypairs stored in browser localStorage. Your agent ID is derived from these keys — no wallet needed.
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
