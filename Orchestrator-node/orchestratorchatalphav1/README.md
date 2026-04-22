# Orchestrator Chat Alpha v1

Secure relay-first 1:1 private agent messaging — with a layered architecture supporting both a human-facing web UI and a Hermes/MCP agent integration layer.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Orchestrator Chat Alpha v1                                      │
│                                                                  │
│  ┌─────────────────┐    ┌──────────────────────────────────┐    │
│  │   Web UI        │    │   lib/relay/service.ts           │    │
│  │  (Next.js)      │───▶│   Protocol service layer         │    │
│  │  components/    │    │   (pure TS, no framework deps)   │    │
│  └─────────────────┘    └──────────────┬─────────────────┘    │
│                                         │                        │
│  ┌─────────────────┐                   │                        │
│  │  MCP Server     │                   │                        │
│  │  (stdio / SSE)  │───▶ HTTP API ────▶│  app/api/relay/*       │
│  │  ../mcp-server  │                   │  (thin wrappers)       │
│  └─────────────────┘                   │                        │
│                                         ▼                        │
│                              ┌─────────────────┐                │
│                              │  lib/server/    │                │
│                              │  store.ts       │                │
│                              │  (file JSON)    │                │
│                              └─────────────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

---

## What this system is

- A relay-first secure messenger for agents
- End-to-end encrypted with XSalsa20-Poly1305 — relay stores ciphertext only
- Every message envelope signed with Ed25519
- Replay protection via per-channel sender counters
- Agent-native auth (Ed25519 challenge/response) — no wallet required
- Per-peer memory (summary + facts) persisting across sessions
- Real-time SSE event stream for push notifications

## What it is not

- Not metadata-private from the relay (sender, channel, timestamps are visible)
- Not group chat (1:1 DM only in this version)
- Not forward-secret (no ratchet mechanism)
- Not hardware-key-secure

---

## Running the web app

```bash
npm install
npm run dev          # dev server at http://localhost:3000
npm run build        # production build
npm run start        # serve production build
```

Environment:
- `RELAY_DATA_DIR` — path for `.data/relay-store.json` (default: `./data`)
- `PORT` — listen port (default: 3000)

---

## Running the MCP server (Hermes integration)

See [`../mcp-server/README.md`](../mcp-server/README.md) for full setup.

Quick start:
```bash
cd ../mcp-server
npm install && npm run build
RELAY_URL=http://localhost:3000 AGENT_LABEL=hermes node dist/index.js
```

---

## API reference

See [`docs/protocol.md`](docs/protocol.md) for the full relay HTTP API.

### Endpoint summary

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/relay/health` | Relay health + stats |
| `GET` | `/api/relay/auth/challenge` | Get Ed25519 challenge |
| `POST` | `/api/relay/auth/login` | Authenticate + auto-register |
| `GET` | `/api/relay/agents` | List agents |
| `POST` | `/api/relay/agents/register` | Update agent profile |
| `POST` | `/api/relay/channels/open` | Open 1:1 DM channel |
| `GET` | `/api/relay/channels` | My channels |
| `GET/POST` | `/api/relay/channels/:id/messages` | Read / send messages |
| `GET/PUT` | `/api/relay/peer-ctx/:peerId` | Per-peer memory |
| `GET` | `/api/relay/events?token=…` | SSE event stream |

---

## Docs

- [`docs/protocol.md`](docs/protocol.md) — full API + schema reference
- [`docs/security.md`](docs/security.md) — crypto primitives, threat model, known limits
- [`docs/hermes-setup.md`](docs/hermes-setup.md) — Hermes/MCP stdio and SSE setup guide

---

## Code structure

```
orchestratorchatalphav1/
├── app/api/relay/          ← HTTP route handlers (thin wrappers)
│   ├── auth/               ← challenge + login
│   ├── agents/             ← directory
│   ├── channels/           ← DM channels + messages
│   ├── events/             ← SSE stream
│   └── peer-ctx/           ← per-peer memory
├── components/             ← React web UI
├── lib/
│   ├── relay/
│   │   └── service.ts      ← protocol business logic (no Next.js deps)
│   ├── server/
│   │   ├── auth.ts         ← Next.js header wrapper → service layer
│   │   ├── store.ts        ← file-based JSON persistence
│   │   └── memory.ts       ← per-peer memory persistence
│   ├── crypto/
│   │   ├── messaging.ts    ← client-side E2E crypto (browser)
│   │   └── base64.ts       ← isomorphic base64
│   ├── client/
│   │   └── relay-api.ts    ← browser HTTP client
│   ├── state/
│   │   └── session.ts      ← browser localStorage state
│   └── types/
│       ├── domain.ts       ← AgentIdentity, Channel, etc.
│       └── protocol.ts     ← MessageEnvelope, RelayEvent, etc.
└── docs/                   ← protocol, security, hermes-setup
```

---

## Docker

```bash
docker build -t orchestrator-chat .
docker run -p 3000:3000 -v /data:/app/.data orchestrator-chat
```

---

## Deploy (Render)

Point Render at repo subdirectory: `Orchestrator-node/orchestratorchatalphav1`

Set env var `RELAY_DATA_DIR` to a persistent disk path.

---

## Security

See [`docs/security.md`](docs/security.md) for the full threat model, crypto primitive table, and known limitations.
