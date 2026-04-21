# Op-control

Op-control is the AGI Alpha operator dashboard in contract-first mode.

## Scope

This app is focused on sign-only operator workflows:
- monitor v1 + Prime + v2 lanes from on-chain reads
- inspect job specs/completions from on-chain URI -> IPFS
- generate unsigned tx + review manifests for operator signing
- monitor autonomous/keepalive GitHub workflows
- configure BYO external agent connections that can produce candidate work packages
- deterministically ingest and validate candidate work before manifest/unsigned tx packaging

No AGI Alpha MCP dependency is required at runtime.

## Platform shell transition (Task 1)

Mission Control now includes a top-level multi-project platform shell with sections:
- Dashboard
- Projects
- Runtimes
- Skills
- Executions
- Settings

Notes:
- `Executions` now has two sub-views:
  - `Overview` (informational-only seeded execution table)
  - `Legacy workspace` (existing Emperor_OS Mission Control execution flows)
- `Projects` includes Emperor_OS, Polymarket (scaffold), and a coming-soon placeholder.
- Emperor_OS card provides an embedded legacy workspace path in-app.
- Separate external legacy deployment is not enabled in this environment.

## Platform entities (Task 2 foundation)

Mission Control now includes typed platform entities and seeded local records in frontend modules:
- Models: `src/models/platform.js`
- Seed data: `src/state/platform-seed.js`
- Hook/data access: `src/hooks/usePlatformData.js`

Entity fields are explicit and extensible:
- Project: `id`, `slug`, `name`, `status`, `adapterKey`, capability flags, optional `legacyUrl`
- Runtime: `id`, `name`, `provider`, `endpointType`, `status`, `workspaceRoot`, `projectScopes`, capability flags, `supportsSigning=false`
- Skill: `id`, `slug`, `name`, `kind`, `scope`, `version`, `status`
- Execution: `id`, `projectId`, `runtimeId`, `status`, `deterministicStepCount`, `llmCallCount`, `approvalRequired`, `createdAt`

Current data source is intentionally local/read-only seed data (no database, no write API).

## Project adapter system (Task 4)

Project metadata now comes from adapter definitions instead of static project cards:
- Adapter contract: `src/adapters/projects/ProjectAdapter.js`
- Registry: `src/adapters/projects/index.js`
- Emperor_OS adapter: `src/adapters/projects/emperor-os/EmperorOsAdapter.js`
- Polymarket scaffold adapter: `src/adapters/projects/polymarket/PolymarketAdapter.js`

Shell views consume adapter-derived metadata for:
- capability flags
- request type declarations
- doctrine flags
- legacy entry points
- scaffold notes

Architecture note: `docs/platform-shell-project-adapters.md`

## Runtime registry concept

- Runtime cards are backed by seeded typed records (`PLATFORM_SEED_DATA.runtimes`).
- Registry fields define provider, endpoint type, workspace root, project scopes, and capability flags.
- Registry is currently read-only scaffold data.
- No runtime in this phase has signing authority (`supportsSigning=false` everywhere).
- Future phase: live heartbeat + deterministic backend registry endpoint.

## Skills registry concept

- Skills cards are backed by seeded typed records (`PLATFORM_SEED_DATA.skills`).
- Each record has explicit `kind`, `scope`, `version`, and `status`.
- Registry is currently read-only scaffold data for platform-level UX coherence.
- Future phase: real skill manifests and deterministic persistence.

## Migration path (current transition state)

1. Platform shell is the top-level navigation and project catalog.
2. Project adapters declare project metadata, doctrine flags, and legacy entry points.
3. Executions overview is informational-only and deterministic-read model driven.
4. Emperor_OS legacy workspace remains embedded for live operations.
5. Separate external legacy deployment is not enabled in this environment.
6. Polymarket remains scaffold-only until adapter execution planning and validation hooks are implemented.

## Deterministic core vs external agent boundary

**Deterministic core (Emperor_OS + Mission Control):**
- contract reads / lane normalization / brief construction
- required artifacts + acceptance checks
- candidate result validation (schema, path scope, hashes, lane checks)
- canonical publication bundle, signing manifest, unsigned tx preview

**External agents (BYO adapters):**
- planning, reasoning, writing/coding, tool use
- candidate deliverable production only
- never canonical state mutation and never authoritative tx package generation

**Human boundary:**
- operator review/sign/broadcast only
- signing remains outside runtime (MetaMask/Ledger)

## Run lifecycle (agent mode)

1. Create an agent connection (`/api/agent-connections`)
2. Prepare a deterministic packet (`POST /api/agent-runs/prepare`)
3. Start external run (`POST /api/agent-runs/start`)
4. Poll/status (`GET /api/agent-runs/:runId`)
5. Ingest candidate result (`POST /api/agent-runs/:runId/ingest`)
6. Review deterministic checks + unsigned tx preview in UI

## Key API routes

Existing routes remain unchanged. New agent routes:

- `GET /api/agent-connections`
- `POST /api/agent-connections`
- `POST /api/agent-connections/test`
- `PATCH /api/agent-connections/:id`
- `DELETE /api/agent-connections/:id`
- `POST /api/agent-runs/prepare`
- `POST /api/agent-runs/start`
- `GET /api/agent-runs/:runId`
- `POST /api/agent-runs/:runId/ingest`
- `POST /api/agent-runs/:runId/cancel`

## State files initialized

- `mission-control/state/agent-connections.json`
- `mission-control/state/agent-runs.json`

Both use atomic write/rename updates.

## Recommended Hermes/OpenClaw integration pattern

Use `hermes` or `openclaw` adapter configs as thin webhook contracts:
- `baseUrl`
- `submitPath`
- `statusPathTemplate`
- `resultPathTemplate`
- `authTokenRef` (env ref)

Keep transport contract stable; packet/result schemas are canonical.

## Required environment

- `ETH_RPC_URL` (or `RPC_URL`)
- `PINATA_JWT` (required for `/api/ipfs/pin-json`)

Optional agent env refs:
- any `authTokenRef`, `envKey`, `apiKeyRef` values referenced by connection config

## Development

```bash
npm install
npm run dev
```

Backend only:

```bash
node server.js
```
