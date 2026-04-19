# State Machines (Current Reference)

This file is a lightweight index. Canonical logic is in runtime code.

## Job lanes (AGIJobManager)
- Implementations exist across `agent/`, `agent/Job-v1/`, and `agent/Job-v2/`.
- Use per-lane state under `agent/state/jobs/*.json`.
- Typical lifecycle: discovered/evaluated -> apply-ready -> applied -> assigned -> execution -> validation/publish -> completion-ready -> submitted/done.

## Prime lane (AGIJobDiscoveryPrime)
- Canonical status and transition logic: `agent/prime-phase-model.js`.
- Persisted per-procurement state: `agent/artifacts/proc_<id>/state.json`.
- READY states represent operator signing boundaries.

## Principle
Any transition model used operationally must be:
1. persisted,
2. deterministic,
3. restart-safe,
4. auditable through artifacts.

See:
- [PRIME_PHASE_MODEL.md](./PRIME_PHASE_MODEL.md)
- [AGIJOB_OPERATOR_RUNBOOK.md](./AGIJOB_OPERATOR_RUNBOOK.md)
- [ARCHITECTURE_DOCTRINE.md](./ARCHITECTURE_DOCTRINE.md)
