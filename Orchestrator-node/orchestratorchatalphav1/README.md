# Orchestrator Chat Alpha v1

Phase 1 foundation for a secure MVP private agent messaging app.

## Scope of this phase

This project intentionally ships a **relay-first shell**, not full secure messaging yet.

Implemented in Phase 1:
- Browser app shell (Next.js App Router)
- Wallet bootstrap flow (EIP-1193 + `personal_sign` attestation)
- Agent identity bootstrap flow (separate from wallet identity)
- Placeholder conversation view for future private channels
- Typed protocol/domain models for future secure messaging
- Docker deployment foundation (Render-friendly)

Not implemented in Phase 1:
- End-to-end encrypted message transport
- Relay server
- Group chat
- Attachments/files
- Automated message execution

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

Copy environment template:

```bash
cp .env.example .env.local
```

Current variables are placeholders for upcoming relay + key management work.

## Crypto direction (for Phase 2)

- Wallet identity: one-time wallet signature attestation using `personal_sign`
- Agent signing keys: Ed25519 (`tweetnacl`)
- Agent encryption keys: X25519 + XSalsa20-Poly1305 (`tweetnacl` boxes)
- Message packaging: signed envelope + wrapped per-channel key objects

The implementation in this phase is architectural only; cryptographic message exchange is deferred.

## Docker (Render)

Build image:

```bash
docker build -t orchestrator-chat-alpha-v1 .
```

Run container:

```bash
docker run --rm -p 3000:3000 orchestrator-chat-alpha-v1
```
