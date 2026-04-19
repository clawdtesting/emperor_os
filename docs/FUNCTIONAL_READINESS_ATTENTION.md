# Functional Readiness Attention Matrix (Job v1/v2, Prime v1/v2)

Purpose: concrete list of what is still missing to call the system fully functional across AGIJobManager (v1/v2) and Prime (v1/v2) lanes.

## Definition used here: "functional"
A lane is considered functional only when it has all of the following end-to-end:
1. Deterministic discovery/indexing from chain state/events.
2. Deterministic state machine transitions with restart-safe persistence.
3. Complete artifact bundle generation at each consequential stage.
4. Operator-ready unsigned tx + review manifests for every required write path.
5. Lane-specific runbook coverage (including failures/deadlines/recovery).
6. Mission Control surface parity with runtime artifacts/state.

---

## Missing items by lane (what still blocks "fully functional")

### Job v1 (AGIJobManager v1)
- Deterministic validation and reconciliation are still uneven across edge transitions and restart-time consistency paths.
- Artifact schema output still diverges between some legacy/newer modules.
- Retrieval-before-generation and terminal stepping-stone/archive extraction are not yet enforced as hard completion gates.
- Mission Control checklist parity is incomplete, so operators still fall back to manual artifact inspection.

### Job v2 (AGIJobManager v2)
- Deterministic reconciliation under chain/runtime drift still needs deeper edge-case testing.
- Assignment/validator recovery drills need to stay current as v2 contract revisions ship.
- End-to-end no-fallback operator flow still requires hardening for apply→assignment→completion under restart/reorg conditions.

### Prime v1 (AGIJobDiscoveryPrime)
- Runbook coverage for validator-scoring failures and deadline-window failures is incomplete.
- Artifact bundles still vary across monitor/orchestrator/manual execution entrypoints.
- READY handoff quality and phase artifact parity are not yet guaranteed path-independently.
- Mission Control/runtime reconciliation still requires manual cross-checking in some operator decisions.

### Prime v2 (AGIJobManagerPrime / Prime-v2 lane)
- Native deterministic indexing from `PremiumJobCreated` through settlement events into `/api/jobs` is missing/incomplete.
- Settlement-stage state binding from procurement/job artifacts is not yet first-class for assignment/acceptance/finalization visibility.
- Dedicated Prime-v2 operator action queue items (unsigned tx + review manifests) are incomplete.
- Lane is still monitored/operator-assisted, not yet fully promoted to deterministic state-machine + artifact parity.

---

## Cross-lane blockers (all four lanes)

1. **Canonical source-of-truth convergence**
   - Mission Control state and local persisted artifacts are still not a single canonical, reconciled source.

2. **Deterministic validation parity**
   - Validation quality and edge-case coverage differ by lane/path.

3. **Artifact schema consistency**
   - Mixed schema patterns across legacy/newer modules increase reconciliation/recovery cost.

4. **Retrieval/compounding enforcement**
   - Retrieval-before-generation and stepping-stone extraction are not yet mandatory everywhere.

5. **Operator UX completeness**
   - Some required operator actions/checks still rely on manual file inspection instead of surfaced queue/checklist workflows.

---

## Recommended implementation order
1. Prime-v2 indexing + operator action wiring (largest functional gap).
2. Job-v2 lifecycle/indexing parity with v1/Prime.
3. Prime-v1 artifact/runbook consistency hardening.
4. Cross-lane deterministic validation + schema convergence.
5. Cross-lane mandatory retrieval/archive extraction gates.

---

## Completion criteria to remove this attention file
- All four lanes satisfy the six-point functional definition without manual reconstruction steps.
- Mission Control and runtime artifacts/state are canonically reconciled for operator decisions.
- Each lane has deterministic recovery runbooks for failure, deadline pressure, and restart scenarios.
- Retrieval/archive extraction gates are enforced before terminal completion across lanes.
