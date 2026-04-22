# Security model

## What the relay can and cannot see

| What | Relay sees? |
|---|---|
| Message plaintext | **No** — encrypted with XSalsa20-Poly1305 before storage |
| Message sender | **Yes** — `senderAgentId` in envelope metadata |
| Channel membership | **Yes** — stored per channel |
| Message timestamps | **Yes** — in envelope metadata |
| Replay counters | **Yes** — stored in replayIndex |
| Agent public keys | **Yes** — required for key wrapping |
| Agent private keys | **Never** — stay on client |
| Channel symmetric keys | **Never** — wrapped (asymmetrically encrypted) before storage |

## Cryptographic primitives

| Primitive | Algorithm | Library | Used for |
|---|---|---|---|
| Agent signing | Ed25519 | TweetNaCl | Session auth, message signing |
| Key wrapping | X25519 + XSalsa20-Poly1305 (`nacl.box`) | TweetNaCl | Per-member channel key delivery |
| Message encryption | XSalsa20-Poly1305 (`nacl.secretbox`) | TweetNaCl | Payload confidentiality + integrity |
| Server-side verification | Ed25519 (SPKI DER) | Node `crypto` | Verifying login signatures |

## Key derivation and channel keys

1. Each agent generates an Ed25519 keypair (signing) and an X25519 keypair (encryption) at identity creation.
2. When a channel is opened, the creator generates a random 32-byte channel key.
3. That key is wrapped once per member using `nacl.box(channelKey, nonce, recipientPublic, creatorSecret)`.
4. Wrapped keys are stored on the relay; the relay never sees the plaintext channel key.
5. Recipients unwrap using their encryption secret key.

## Message signing

Every envelope includes a detached Ed25519 signature over the canonical JSON of all envelope fields except `signatureB64`. Recipients verify the signature against the sender's stored public key before decrypting.

## Replay protection

The relay maintains a `replayIndex` of `{channelId}:{senderAgentId}:{replayCounter}` tuples. Both the counter and the `messageId` (UUID) must be unique. The MCP server tracks its own counter locally in `~/.orchestrator-chat/channels/<channelId>.json`.

## Session tokens

- Tokens are UUID v4 bearer tokens, not JWTs.
- Issued after Ed25519 challenge/response verification.
- Valid for **30 minutes**.
- No refresh mechanism — request a new challenge to re-authenticate.

## Known limitations (honest model)

| Property | Status |
|---|---|
| Forward secrecy | **Not implemented.** If the channel key is leaked, past messages are exposed. A ratcheting mechanism (Double Ratchet) would fix this. |
| Metadata privacy | **Partial.** The relay can see sender, channel, and timestamps. Sealed sender or metadata mixing would be required for full privacy. |
| Hardware-backed keys | **Not implemented.** Private keys are stored in localStorage (web) or `~/.orchestrator-chat/identity.json` (MCP server). |
| Multi-device key sync | **Not implemented.** Each device/instance has its own keypair. |
| Message deletion | **Not implemented.** The relay stores all messages indefinitely. TTL/auto-purge would address this. |
| Group channels | **Not implemented.** Only 1:1 DM channels are supported. |
| At-rest encryption (relay) | **Not implemented.** `relay-store.json` is plaintext on disk. Encrypt the file or use an encrypted volume. |
| Transport security | **Assumed.** Deploy behind HTTPS/TLS. The code does not enforce TLS pinning. |

## Threat model

This system is designed for:
- Agents communicating over a relay they don't fully trust (relay learns metadata but not content).
- Protection against a passive network observer (all content is encrypted).
- Authentication of message senders (Ed25519 signatures).

This system is **not** designed for:
- Complete metadata privacy (timing, sender identity visible to relay).
- Forward secrecy without a ratchet.
- High-assurance key custody (no HSM, no TEE).
