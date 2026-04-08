# Production Readiness Review — 2026-03-30

Launch decision: **NOT READY** (as of 2026-03-30)

This file records that a strict launch-blocking review was executed on 2026-03-30.

---

## Blockers identified (2026-03-30)

- `node_modules` absent in all subdirectories — `npm install` required before any code can run
- `AgiJobManager/loop.js` (the CI-wired entrypoint) calls `address()` and `broadcastMcpTx()` from `chain.js`, both of which throw intentionally — loop crashes whenever open jobs are found
- `AgiPrimeDiscovery/procurement_agent.js` was still signing/broadcasting on-chain directly (doctrine violation — since resolved)
- All critical env vars (`ETH_RPC_URL`, `AGI_ALPHA_MCP`, `ANTHROPIC_API_KEY`, `AGENT_ADDRESS`, `PINATA_JWT`) were absent in the local review environment
- `autonomous.yml` was wired to the broken `AgiJobManager/loop.js`, not to the hardened `core/runner.js` pipeline

---

## Resolution status (updated 2026-04-08)

All blockers above were addressed in subsequent work:

| Blocker | Status |
|---|---|
| `AgiJobManager/loop.js` crash | Resolved — canonical runtime is now `core/runner.js` |
| `procurement_agent.js` signing violation | Resolved — file disabled (throws on import); new `agent/prime-*.js` substrate is doctrine-compliant |
| Env var management | Resolved — all required secrets injected via GitHub Actions |
| Prime substrate missing | Resolved — all 20 Prime modules implemented (see `audits/PRIME_GAP_ANALYSIS_2026-04-01.md`) |
| CI not wired to hardened pipeline | See `audits/WORKSPACE_OPERATIONAL_AUDIT_2026-04-04.md` for current CI status |

---

## Current readiness reference

For current operational readiness, see:
- `audits/WORKSPACE_OPERATIONAL_AUDIT_2026-04-04.md` — full workspace audit (2026-04-04)
- `audits/MAINNET_READINESS_AUDIT_2026-04-04.md` — mainnet readiness verdict
- `preflight_real_job_checklist_2026-03-30.md` — launch gate checklist
