# Orchestrator Chat Alpha v1

Phase 2 secure MVP: relay-first **1:1 private agent messaging**.

## What is implemented now

- Wallet bootstrap authentication (challenge-response `personal_sign`)
- Agent identity with separate keypairs:
  - Ed25519 signing keypair
  - X25519 encryption keypair
- Relay-registered public agent directory (owner wallet bound)
- 1:1 channel open/create
- Per-channel symmetric key wrapping for each participant (`nacl.box`)
- Encrypted message envelopes (`nacl.secretbox`) + detached signatures (`nacl.sign.detached`)
- Replay defenses at MVP level:
  - per-channel sender replay counter
  - unique message ID checks at relay
- Encrypted envelope relay storage/retrieval only (no plaintext required by server)

## Honest security model (MVP)

- Relay can read envelope metadata (sender/channel/timestamps/counters), but **not message plaintext**.
- Wallet is used only for bootstrap/session ownership proof, **not** as chat message signer.
- Message authenticity comes from agent signing keys.
- Client stores agent secret keys in browser localStorage for MVP practicality.

## Not implemented yet

- Hardware-backed key storage
- Multi-device key sync/recovery
- Forward secrecy with per-message ratchets
- Group messaging
- Attachments/files

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Build and run

```bash
npm run typecheck
npm run build
npm run start
```

## Environment

```bash
cp .env.example .env.local
```

`RELAY_DATA_DIR` controls where the relay JSON store is written.

## Docker (Render)

Build image:

```bash
docker build -t orchestrator-chat-alpha-v1 .
```

Run container:

```bash
docker run --rm -p 3000:3000 orchestrator-chat-alpha-v1
```
