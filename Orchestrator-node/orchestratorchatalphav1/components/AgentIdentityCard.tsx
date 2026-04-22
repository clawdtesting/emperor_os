'use client';

import { useState } from 'react';
import { bytesToHex } from 'viem';
import type { AgentIdentity } from '@/lib/types/domain';

interface AgentIdentityCardProps {
  walletAddress: `0x${string}`;
  onCreated: (agent: AgentIdentity) => void;
}

function randomHex(size: number): `0x${string}` {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export function AgentIdentityCard({ walletAddress, onCreated }: AgentIdentityCardProps) {
  const [label, setLabel] = useState('Hermes-Local');

  const createIdentity = () => {
    const id = randomHex(16);

    const identity: AgentIdentity = {
      id,
      label,
      walletAddress,
      encryptionPublicKey: randomHex(32),
      signingPublicKey: randomHex(32),
      keyVersion: 1,
      createdAt: new Date().toISOString(),
      status: 'active'
    };

    onCreated(identity);
  };

  return (
    <section className="card">
      <h2>2) Agent identity bootstrap</h2>
      <p>
        Agent identity is separate from wallet identity. In Phase 2 this will bind to durable Ed25519/X25519 keys.
      </p>
      <label className="label">
        Agent label
        <input value={label} onChange={(event) => setLabel(event.target.value)} className="input" />
      </label>
      <button className="button" onClick={createIdentity}>
        Initialize Agent Identity
      </button>
    </section>
  );
}
