# Audits Framework

This directory is Emperor_OS' deterministic audit harness.

- Entry point: `node audits/run_all.js`
- Report outputs: `audits/reports/latest/` and `audits/reports/history/`
- Family registry: `audits/lib/audit_registry.js`
- Profile definitions: `audits/audit_profiles.js`

## Quick start

```bash
# Full suite (default)
node audits/run_all.js

# Fast profile (blocking checks for rapid iteration)
node audits/run_all.js --profile fast

# Runtime profile (integration health)
node audits/run_all.js --profile runtime

# Pre-sign safety gate
node audits/run_all.js --profile presign --fail-fast

# Machine-readable output
node audits/run_all.js --profile full --json

# Human-readable markdown to stdout
node audits/run_all.js --profile full --md

# Limit to specific families
node audits/run_all.js --families static,safety,protocol
```

## Audit families

Families are declared in `AUDIT_FAMILIES` and mapped in `audits/lib/audit_registry.js`.

Current families:

- `static` — fast source/config checks.
- `safety` — signing/broadcast boundary enforcement.
- `protocol` — contract and protocol-level consistency checks.
- `presign` — final transaction gate before human signs.
- `functional` — end-to-end behavioral checks.
- `recovery` — crash/restart/idempotency behavior.
- `artifact` — artifact completeness, reviewability, integrity.
- `doctrine` — conformance to AGENTS/SOUL doctrine constraints.
- `integration` — RPC/MCP/IPFS dependency readiness.
- `determinism` — same-input/same-output guarantees.
- `performance` — timing/efficiency checks.
- `economics` — economic viability checks.

## Profiles and when to use them

Profiles are resolved through `getEnabledFamilies(profile)` in `audits/lib/audit_registry.js` and surfaced in `audits/audit_profiles.js`.

- `fast` (default blocking): run pre-commit and before worker startup.
- `full`: deep confidence run for release/nightly/manual audits.
- `presign` (strict blocking): run immediately before operator signing.
- `runtime`: periodic health checks while workflows are active.

Recommendation:

- Inner loop: `fast`
- Merge/release: `full`
- Any irreversible on-chain step: `presign`
- Live monitoring loop: `runtime`

## Output format and status semantics

Each family returns a normalized report object (`buildAuditReport`):

- `auditType`, `status`, timestamps, duration
- `summary` counters: `pass`, `warn`, `fail`, `critical`
- `checks[]` entries with `name`, `status`, and `details`

Master runner (`buildMasterReport`) aggregates all family checks into:

- `reportType: "master"`
- top-level `status`
- per-family rollups in `audits[]`
- flattened `checks[]`

Severity ordering is centralized in `audits/lib/severity.js` and used consistently across JSON + Markdown reports.

## Adding a new audit check

1. Pick the target family (e.g. `audits/doctrine/`, `audits/presign/`).
2. Create `audits/<family>/checks/<new_check>.js` with a `run(ctx)` export.
3. Return or append normalized check rows (`pass|warn|fail|critical`) with useful `details`.
4. Register the check in that family's `run.js` (either `CHECKS` array import path or explicit import list).
5. Execute profile(s) that include the family and verify report generation:
   - `node audits/run_all.js --profile fast`
   - `node audits/run_all.js --profile full --json`

When adding a *new family*:

1. Add family key to `AUDIT_FAMILIES` in `audits/lib/constants.js`.
2. Add metadata (`label`, `description`, `blocking`, `profile`) in `audits/lib/audit_registry.js`.
3. Create `audits/<family>/run.js` exporting `run(opts)`.
4. Optionally expose profile intent in `audits/audit_profiles.js` docs/comments.

## Troubleshooting

### 1) "runner file missing" / family skipped

- Confirm `audits/<family>/run.js` exists.
- Confirm export signature includes `run()`.
- Confirm family is present in `AUDIT_FAMILIES`.

### 2) Empty or stale reports

- Check write permissions under `audits/reports/`.
- Verify `writeFullReport` is called in family runner (unless intentionally `skipWrite`).

### 3) Network/RPC/MCP related failures

- Prefer running `--profile fast` first to isolate non-network checks.
- Then run `--profile runtime` or `--profile full` with valid env vars (`ETH_RPC_URL`, MCP/IPFS creds where required).

### 4) Pre-sign gate blocks transaction handoff

- Treat as expected safety behavior, not noise.
- Read `audits/reports/latest/presign.{json,md}` and fix the exact failing checks before operator signing.

## Notes on artifact paths

The audit framework can inspect both workspace-level `artifacts/` and `agent/artifacts/` depending on check family and runtime path assumptions. Runtime code currently resolves canonical artifact paths via workspace-root `artifacts/` constants, while operational memory/state conventions also reference `agent/artifacts/` in some docs. Keep checks tolerant to both roots until path unification is complete.
