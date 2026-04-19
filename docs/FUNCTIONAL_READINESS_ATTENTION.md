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

## Job v1 (AGIJobManager v1)

### Current status
- Mostly live, but not yet uniformly hardened.

### Attention needed
- Close uneven deterministic validation and reconciliation coverage for edge cases and restart-time consistency checks.
- Standardize artifact schemas where legacy/newer module outputs still diverge.
- Enforce retrieval-before-generation and terminal stepping-stone/archive extraction as mandatory completion gates (not optional behavior).
- Reduce operator dependence on manual local artifact inspection by surfacing checklist parity in Mission Control.

### Exit criteria
- All v1 edge-case transitions have deterministic validators and restart-safe checks.
- Every terminal completion enforces archive extraction + index update before DONE.
- Mission Control and local artifact/state views are reconciled without manual diffing.

---

## Job v2 (AGIJobManager v2)

### Current status
- Lifecycle-visible: v2 contract-first reads, `/api/jobs` indexing fields, and lane surfaces are wired with runtime/on-chain status parity.

### Attention needed
- Continue edge-case testing for v2 status reconciliation when local runtime state lags chain events.
- Keep validator/assignment recovery drills current as new v2 contract revisions are introduced.

### Exit criteria
- v2 jobs remain fully indexed and lifecycle-visible in Mission Control and runtime state under restart/reorg scenarios.
- Operator can run end-to-end v2 apply→assignment→completion flow without fallback/manual reconstruction.
- v2 lane recovery documentation stays deterministic and signing-gate-specific as lane logic evolves.

---

## Prime v1 (AGIJobDiscoveryPrime)

### Current status
- Live phase model and operator-gated readiness are in place.
- Added deterministic reconciliation snapshots (`reconciliation_snapshot.json`) and expanded Prime operator failure playbooks, but full cross-entrypoint parity verification still requires continued validation.

### Attention needed
- Complete operator runbook coverage for validator scoring lifecycle failures and deadline edge windows.
- Eliminate artifact generation inconsistency across monitor/orchestrator/manual paths.
- Enforce consistent phase artifact bundles and READY handoff quality regardless of execution entrypoint.
- Improve Mission Control/local runtime reconciliation so Prime operator decisions do not require manual cross-checking.

### Exit criteria
- All Prime v1 phases emit the same required artifact set independent of path.
- Edge/deadline failure playbooks are explicit and operator-usable.
- READY states always have complete, deterministic artifact + tx package bundles.

---

## Prime v2 (AGIJobManagerPrime / Prime-v2 lane)

### Current status
- Monitored/operator-assisted only; not fully wired as a first-class indexed lane.

### Attention needed
- Add native Prime-v2 list indexing from `PremiumJobCreated` and downstream settlement events into `/api/jobs`.
- Attach settlement-stage state from procurement/job artifacts for assignment/acceptance/finalization visibility.
- Add dedicated Prime-v2 operator actions so unsigned settlement tx + review manifests are first-class queue items.
- Promote Prime-v2 from "monitored" to complete lane with deterministic state machine + artifact parity.

### Exit criteria
- Prime-v2 jobs appear as first-class indexed entities with settlement lifecycle status.
- Prime-v2 operator actions are available without ad hoc/manual workflows.
- Prime-v2 completion path follows same deterministic artifact/state standards as Prime v1.

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
