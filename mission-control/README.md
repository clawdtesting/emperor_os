# Op-control

Op-control is the AGI Alpha operator dashboard in contract-first mode.

## Scope

This app is focused on sign-only operator workflows:
- monitor v1 + Prime + v2 lanes from on-chain reads
- inspect job specs/completions from on-chain URI -> IPFS
- generate unsigned tx + review manifests for operator signing
- monitor autonomous/keepalive GitHub workflows

No AGI Alpha MCP dependency is required at runtime.

## Runtime layout

- `src/` — React + Vite frontend
- `server.js` — Express API for on-chain reads, IPFS fetch/pin, unsigned package generation
- `lib/` — normalization and contract-first helpers

## Key API routes

- `GET /api/jobs` — v1/v2/Prime list from contracts + RPC
- `GET /api/job-spec/:jobId` — resolve spec URI on-chain, fetch payload from IPFS
- `GET /api/job-metadata/:jobId` — resolve completion/spec URI on-chain, fetch payload from IPFS
- `POST /api/job-requests` — generate unsigned `createJob(...)` tx package + review manifest
- `POST /api/ipfs/pin-json` — Pinata-direct JSON pinning (requires `PINATA_JWT`)
- `POST /api/validator/v1/prepare` — external validator package generation (contract/IPFS based)

## Required environment

- `ETH_RPC_URL` (or `RPC_URL`)
- `PINATA_JWT` (required for `/api/ipfs/pin-json`)

## Development

```bash
npm install
npm run dev
```

Backend only:

```bash
node server.js
```
