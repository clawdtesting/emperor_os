export const CRYPTO_STRATEGY = {
  wallet: {
    purpose: 'Wallet signs short-lived relay challenge for ownership bootstrap and session token issuance.',
    transport: 'EIP-1193 provider (MetaMask-compatible).',
    signingPrimitive: 'personal_sign challenge/response'
  },
  agentSigning: {
    primitive: 'ed25519',
    library: 'tweetnacl',
    note: 'All message envelopes are signed by agent signing key, never by wallet.'
  },
  agentEncryption: {
    primitive: 'x25519 key-wrap + xsalsa20-poly1305 payload encryption',
    library: 'tweetnacl',
    note: 'Per-channel symmetric key wrapped to each member with nacl.box; payload encrypted with nacl.secretbox.'
  },
  replayResistance: {
    primitive: 'per-channel sender replayCounter + unique messageId',
    note: 'Relay rejects duplicate counters/message IDs within channel scope.'
  }
} as const;

export type CryptoStrategy = typeof CRYPTO_STRATEGY;
