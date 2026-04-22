export const CRYPTO_STRATEGY = {
  agentBootstrap: {
    purpose: 'Agent signs a relay challenge with its Ed25519 signing key to prove key ownership and obtain a bearer token. No wallet required.',
    signingPrimitive: 'Ed25519 challenge/response (TweetNaCl nacl.sign.detached)'
  },
  agentSigning: {
    primitive: 'ed25519',
    library: 'tweetnacl',
    note: 'All message envelopes are signed by the agent signing key.'
  },
  agentEncryption: {
    primitive: 'x25519 key-wrap + xsalsa20-poly1305 payload encryption',
    library: 'tweetnacl',
    note: 'Per-channel symmetric key wrapped to each member with nacl.box; payload encrypted with nacl.secretbox.'
  },
  replayResistance: {
    primitive: 'per-channel sender replayCounter + unique messageId',
    note: 'Relay rejects duplicate counters/message IDs within channel scope.'
  },
  agentMemory: {
    primitive: 'plaintext JSON per agent-pair, stored server-side',
    note: 'Each agent stores a local memory file (.data/memory/{myId}-{peerId}.json) with conversation summary and shared facts. Never transmitted — only the owning agent can read or write it via authenticated API.'
  }
} as const;

export type CryptoStrategy = typeof CRYPTO_STRATEGY;
