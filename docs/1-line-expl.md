# One-line module map (agent/)

This is a quick orientation index for the current `agent/` runtime tree.

- `agent/orchestrator.js` — runs the main job pipeline stages in sequence.
- `agent/Job-v1/` — v1 lane-specific modules and compatibility entrypoints.
- `agent/Job-v2/` — v2 lane-specific modules and compatibility entrypoints.
- `agent/discover.js` / `evaluate.js` / `apply.js` / `confirm.js` — intake and application flow.
- `agent/execute.js` / `validate.js` / `publish.js` / `submit.js` — execution and completion preparation.
- `agent/tx-builder.js` / `signing-manifest.js` / `pre-sign-checks.js` — unsigned tx packaging and review prep.
- `agent/state.js` / `recovery.js` / `state-retention.js` / `lock.js` — state persistence, recovery, and execution safety.
- `agent/prime-monitor.js` / `prime-orchestrator.js` — Prime lifecycle monitoring and advancement.
- `agent/prime-phase-model.js` / `prime-next-action.js` — Prime phase and action derivation logic.
- `agent/prime-review-gates.js` / `prime-presign-checks.js` — hard gates before operator-facing tx packages.
- `agent/prime-tx-builder.js` / `prime-tx-validator.js` — Prime unsigned tx package generation/validation.
- `agent/prime-execution-bridge.js` — bridge from Prime selection into linked job execution.
- `agent/prime-validator-engine.js` / `prime-validator-scoring.js` — validator/scoring helper logic.
- `agent/handlers/` — domain-specific execution handlers.
- `agent/execution-tier/` — policy and tiering support modules.

For deeper operational meaning, use:
- [CURRENT_SYSTEM.md](./CURRENT_SYSTEM.md)
- [AGIJOB_OPERATOR_RUNBOOK.md](./AGIJOB_OPERATOR_RUNBOOK.md)
- [PRIME_ARCHITECTURE.md](./PRIME_ARCHITECTURE.md)
