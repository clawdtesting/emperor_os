export const CRYPTO_STRATEGY = {
  wallet: {
    purpose: 'Wallet signs one-time bootstrap attestation only.',
    transport: 'EIP-1193 provider (MetaMask-compatible).',
    signingPrimitive: 'personal_sign'
  },
  agentSigning: {
    primitive: 'ed25519',
    library: 'tweetnacl',
    note: 'Agent keypair is distinct from wallet key; wallet attests ownership binding.'
  },
  agentEncryption: {
    primitive: 'x25519 + xsalsa20-poly1305 sealed boxes',
    library: 'tweetnacl',
    note: 'Per-channel symmetric keys wrapped per participant in future phase.'
  },
  envelopeIntegrity: {
    primitive: 'signature over canonical envelope payload',
    note: 'Relay cannot forge sender identity when signature verification is enforced.'
  }
} as const;

export type CryptoStrategy = typeof CRYPTO_STRATEGY;
