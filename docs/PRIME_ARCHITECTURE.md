# Prime Architecture (Current)

Prime runtime logic is centered in `agent/prime-*` modules and procurement artifacts under `agent/artifacts/proc_<id>/`.

## Prime module responsibilities
- **Inspection:** `prime-monitor.js`, `prime-inspector.js`, `prime-client.js`
- **Phase modeling:** `prime-phase-model.js`, `prime-next-action.js`
- **Review gates:** `prime-review-gates.js`, `prime-presign-checks.js`
- **Unsigned tx building:** `prime-tx-builder.js`, `prime-tx-validator.js`
- **Monitoring + orchestration:** `prime-monitor.js`, `prime-orchestrator.js`
- **Execution bridge:** `prime-execution-bridge.js` (Prime winner → linked job execution lane)
- **Validator/scoring support:** `prime-validator-engine.js`, `prime-validator-scoring.js` (present, partially mature operationally)

## Phase and artifact model
Prime progression is explicit in per-procurement state and phase bundles:
- State file: `agent/artifacts/proc_<id>/state.json`
- Action orientation: `agent/artifacts/proc_<id>/next_action.json`
- Phase bundle folders: `inspection/`, `application/`, `reveal/`, `finalist/`, `trial/`, `completion/`, `selection/`

At each consequential phase:
1. Build/refresh artifacts.
2. Validate gate preconditions.
3. Produce unsigned tx package.
4. Enter READY/review status and wait for operator.

## Monitoring model
`prime-monitor.js` keeps procurement snapshots current and drives detection of:
- deadline windows,
- shortlist/finalist/selection transitions,
- states that require operator action.

## Execution bridge into job system
When selected, Prime flow uses `prime-execution-bridge.js` to attach the linked AGIJobManager job context and hand execution to the job lane tooling, then returns to Prime completion packaging.

## Signing boundary
Prime modules must never sign or broadcast. All writes are unsigned handoff packages for operator signing.

See also:
- [PRIME_OPERATOR_RUNBOOK.md](./PRIME_OPERATOR_RUNBOOK.md)
- [PRIME_PHASE_MODEL.md](./PRIME_PHASE_MODEL.md)
- [PRIME_UNSIGNED_TX_SPEC.md](./PRIME_UNSIGNED_TX_SPEC.md)
