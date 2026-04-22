'use client';

import { useState } from 'react';
import { fetchChallenge, loginRelay } from '@/lib/client/relay-api';

interface WalletConnectCardProps {
  onConnected: (details: {
    address: `0x${string}`;
    chainId: number;
    bootstrapSignature: string;
    relayToken: string;
    challengeNonce: string;
  }) => void;
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

export function WalletConnectCard({ onConnected }: WalletConnectCardProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const connect = async () => {
    if (!window.ethereum) {
      setError('No EIP-1193 wallet detected. Install MetaMask or compatible wallet.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const accounts = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as string[];
      const chainHex = (await window.ethereum.request({ method: 'eth_chainId' })) as string;
      const address = accounts[0] as `0x${string}`;
      const chainId = Number.parseInt(chainHex, 16);

      const challenge = await fetchChallenge(address);
      const bootstrapSignature = (await window.ethereum.request({
        method: 'personal_sign',
        params: [challenge.message, address]
      })) as string;

      const relayLogin = await loginRelay(address, bootstrapSignature);

      onConnected({
        address,
        chainId,
        bootstrapSignature,
        relayToken: relayLogin.token,
        challengeNonce: challenge.nonce
      });
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Wallet connection failed.';
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2>1) Wallet bootstrap</h2>
      <p>
        Wallet signs a relay challenge to prove ownership. Wallet is only for bootstrap/session auth, not per-message signing.
      </p>
      <button onClick={connect} disabled={busy} className="button">
        {busy ? 'Connecting...' : 'Connect Wallet + Relay Session'}
      </button>
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
