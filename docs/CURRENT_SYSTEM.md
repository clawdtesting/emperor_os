# Current System (Repository Reality)

This document describes Emperor_OS as it exists in this repository today.

## What Emperor_OS is

Emperor_OS is an operator-governed off-chain execution system for AGI Alpha job flows. Runtime logic lives primarily under [`agent/`](../agent), operator UX lives in [`mission-control/`](../mission-control), and doctrine/operations docs live in [`docs/`](./README.md).

## Core execution tracks

## Track A — AGIJobManager job execution

Primary modules are in `agent/` plus compatibility + lane-specific code in `agent/Job-v1/` and `agent/Job-v2/`.

Typical flow:
1. Discover/evaluate jobs.
2. Build unsigned apply package.
3. Operator signs/broadcasts externally.
4. On assignment: execute, validate, publish artifacts.
5. Build unsigned completion package.
6. Operator signs/broadcasts externally.

Canonical files include:
- `agent/orchestrator.js`
- `agent/discover.js`, `agent/evaluate.js`, `agent/apply.js`, `agent/confirm.js`
- `agent/execute.js`, `agent/validate.js`, `agent/publish.js`, `agent/submit.js`
- `agent/tx-builder.js`, `agent/signing-manifest.js`, `agent/pre-sign-checks.js`

See: [AGIJOB_OPERATOR_RUNBOOK.md](./AGIJOB_OPERATOR_RUNBOOK.md).

## Track B — Prime procurement execution

Prime flow is implemented in `agent/prime-*` modules and state/artifacts under `agent/artifacts/proc_<id>/`.

Core Prime control surface:
- `agent/prime-monitor.js`
- `agent/prime-inspector.js`
- `agent/prime-phase-model.js`
- `agent/prime-review-gates.js`
- `agent/prime-tx-builder.js`
- `agent/prime-orchestrator.js`
- `agent/prime-execution-bridge.js`

Phase progression is explicit and artifact-driven, with READY states waiting for operator action.

See:
- [PRIME_ARCHITECTURE.md](./PRIME_ARCHITECTURE.md)
- [PRIME_OPERATOR_RUNBOOK.md](./PRIME_OPERATOR_RUNBOOK.md)

## Mission Control role

`mission-control/` is a separate operator dashboard:
- React + Vite frontend in `mission-control/src/`
- Express API in `mission-control/server.js`

Mission Control is an operator surface for on-chain views, unsigned package preparation, and workflow visibility. It does not remove the human signing boundary.

## Non-negotiable signing boundary

Runtime never signs and never broadcasts transactions.

All irreversible actions must be exported as unsigned JSON tx packages and reviewed/signed by the operator (MetaMask + Ledger). See:
- [ARCHITECTURE_DOCTRINE.md](./ARCHITECTURE_DOCTRINE.md)
- [METAMASK_LEDGER_SIGNING_GUIDE.md](./METAMASK_LEDGER_SIGNING_GUIDE.md)

## Artifact-first + state persistence

System state is persisted on disk, primarily in:
- `agent/state/jobs/*.json`
- `agent/artifacts/proc_<id>/state.json`

Execution outputs are persisted as artifacts under `artifacts/` and `agent/artifacts/` and are required for safe restart and auditability.

## Live vs partial vs planned

### Live (implemented in repo)
- Job execution lanes (`agent/`, `agent/Job-v1/`, `agent/Job-v2/`).
- Prime modules (`agent/prime-*`).
- Mission Control frontend/backend shell (`mission-control/src/`, `mission-control/server.js`).
- Unsigned tx builders + review artifacts.

### Partial (implemented but still maturing)
- End-to-end Prime validator/scoring support across all edge windows.
- Retrieval/stepping-stone compounding as default behavior.
- Cross-surface consistency between Mission Control state views and local runtime artifacts.

### Planned / active hardening areas
- Stronger deterministic validation and reconciliation coverage.
- Tighter archive extraction/compounding loops.
- Additional operational guardrails around deadline/race handling.

For current actionable gaps, use [IMPLEMENTATION_GAPS.md](./IMPLEMENTATION_GAPS.md) as the live tracker.
