# Emperor_OS Docs Index

This file is an index, not a deep architecture explainer.

Use this page to identify **what is canonical**, **what is supporting reference**, and **what is historical context**.

## Canonical hierarchy (read in order)

1. [ARCHITECTURE_DOCTRINE.md](./ARCHITECTURE_DOCTRINE.md) — non-negotiable rules (highest authority).
2. [CURRENT_SYSTEM.md](./CURRENT_SYSTEM.md) — current repository reality (`agent/` runtime, `mission-control/` operator UI).
3. [OPERATOR_INSTRUCTIONS.md](./OPERATOR_INSTRUCTIONS.md) — short operator safety entrypoint (operator guide).
4. [IMPLEMENTATION_GAPS.md](./IMPLEMENTATION_GAPS.md) — present-tense missing/partial areas.

If any document conflicts with this hierarchy, trust the higher item.

## Runtime reality anchors

- Runtime system: [`/agent`](../agent)
- Operator dashboard/API: [`/mission-control`](../mission-control)
- Documentation set: [`/docs`](./README.md)

## Supporting docs (non-canonical but active)

### Operator runbooks
- [AGIJOB_OPERATOR_RUNBOOK.md](./AGIJOB_OPERATOR_RUNBOOK.md)
- [PRIME_OPERATOR_RUNBOOK.md](./PRIME_OPERATOR_RUNBOOK.md)
- [METAMASK_LEDGER_SIGNING_GUIDE.md](./METAMASK_LEDGER_SIGNING_GUIDE.md)

### Prime architecture + specs
- [PRIME_ARCHITECTURE.md](./PRIME_ARCHITECTURE.md)
- [PRIME_PHASE_MODEL.md](./PRIME_PHASE_MODEL.md)
- [PRIME_UNSIGNED_TX_SPEC.md](./PRIME_UNSIGNED_TX_SPEC.md)
- [PRIME_BUILD_EXECUTION_ORDER.md](./PRIME_BUILD_EXECUTION_ORDER.md)

### Cross-cutting references
- [state-machines.md](./state-machines.md)
- [FUNCTIONAL_READINESS_ATTENTION.md](./FUNCTIONAL_READINESS_ATTENTION.md)
- [PRODUCTION_FAILURE_SCENARIOS.md](./PRODUCTION_FAILURE_SCENARIOS.md)
- [1-line-expl.md](./1-line-expl.md)
- [refactor-protocol-runtime-migration.md](./refactor-protocol-runtime-migration.md)

## Historical / snapshot docs (not source of truth)

These are retained for audit trail and historical context. Do not use them as current operational truth.

- [`archive/CODEBASE_TRIAGE_2026-04-01.md`](./archive/CODEBASE_TRIAGE_2026-04-01.md)
- [`archive/READINESS_TODO_2026-04-08.md`](./archive/READINESS_TODO_2026-04-08.md)
- [`archive/preflight_real_job_checklist_2026-03-30.md`](./archive/preflight_real_job_checklist_2026-03-30.md)
- [`archive/production_readiness_review_2026-03-30.md`](./archive/production_readiness_review_2026-03-30.md)

## Audits and dated reviews

`docs/audits/` contains dated assessments and review artifacts. These are evidence and context, not canonical operational doctrine.
