# Prime Operator Runbook

Phase-based checklist for AGIJobDiscoveryPrime operation.

## Scope
- Runtime: `agent/prime-*`
- Procurement state/artifacts: `artifacts/proc_<id>/`
- Signing toolchain: MetaMask + Ledger

## Phase review model

### 1) Inspection / fit decision
Review:
- `inspection/*` bundle
- `fit_evaluation` output and deadline context
Decision:
- proceed (`FIT_APPROVED`) or stop (`NOT_A_FIT`)

### 2) Commit-ready
Required package:
- application artifacts + commitment material
- `unsigned_commit_tx.json`
- review checklist / decoded call
Operator action:
- sign+broadcast commit tx
- record tx hash/state update

### 3) Reveal-ready
Required package:
- reveal payload + commitment verification
- `unsigned_reveal_tx.json`
Operator action:
- sign+broadcast reveal tx
- record tx hash/state update

### 4) Finalist accept (if shortlisted)
Required package:
- finalist eligibility evidence
- `unsigned_accept_finalist_tx.json`
Operator action:
- sign+broadcast finalist acceptance

### 5) Trial submit
Required package:
- trial artifact manifest
- publish + fetch-back verification
- `unsigned_submit_trial_tx.json`
Operator action:
- sign+broadcast trial submission

### 6) Validator scoring (if assigned)
Required package (score commit):
- `scoring/validator_assignment.json`
- `scoring/evidence_bundle.json`
- `scoring/adjudication_result.json`
- `scoring/score_commit_payload.json`
- `scoring/unsigned_score_commit_tx.json`

Required package (score reveal):
- `scoring/score_commit_payload.json`
- `scoring/score_reveal_payload.json`
- `scoring/unsigned_score_reveal_tx.json`

Operator action:
- score commit window: sign+broadcast score commit tx
- score reveal window: sign+broadcast score reveal tx
- record tx hash/state update after each submission

### 7) Completion (if selected)
Required package:
- linked job completion artifact set
- `unsigned_request_completion_tx.json`
Operator action:
- sign+broadcast completion request

## Deadline edge-window playbook

### Deadline severity bands
- **< 4h remaining:** urgent, continue only with prebuilt READY bundle.
- **< 1h remaining:** critical, no manual reconstruction; either sign complete package or defer.
- **expired window:** do not sign. Set/confirm `MISSED_WINDOW` and record recovery note.

### If READY state exists but package is incomplete
1. Open `reconciliation_snapshot.json`.
2. If `readyHandoffComplete=false`, treat state as blocked.
3. Re-run orchestrator/monitor path to regenerate artifacts.
4. Do not sign until `missingRequiredArtifacts` is empty.

### If chain phase advanced past expected window
1. Confirm current `chain_snapshot.json` phase.
2. Compare to local `state.json` status.
3. If required window was missed, move to `MISSED_WINDOW` via controlled transition/recovery.
4. Record reason in state + daily memory before next action.

## Validator scoring failure playbooks

### Score commit generation fails
- Check `scoring/validator_assignment.json` exists and `assigned=true`.
- Check `scoring/evidence_bundle.json` + `adjudication_result.json` are present.
- Regenerate commit payload via orchestrator/monitor path; do not handcraft.
- If still failing near deadline, record failure note and escalate as `MISSED_WINDOW` risk.

### Score reveal continuity mismatch
- Compare `score_reveal_payload.json` against prior `score_commit_payload.json` commitment.
- If mismatch: halt signing, regenerate deterministic payloads from artifacts.
- If continuity cannot be re-established before deadline: mark blocked, document explicit non-sign decision.

### Validator window expired before sign
- Never sign expired score tx packages.
- Update status with explicit missed-window context; include window + timestamp in recovery note.

## Mission Control ↔ local runtime reconciliation

Use `artifacts/proc_<id>/reconciliation_snapshot.json` as the parity source.

For every operator decision:
1. Confirm `stateStatus` matches Mission Control phase label.
2. Confirm `nextAction` and `nextActionSummary` match pending operator task.
3. Confirm `missingRequiredArtifacts` is empty for READY states.
4. Sign only when `readyHandoffComplete=true`.

If Mission Control and local artifacts disagree:
- Local persisted state/artifacts remain canonical.
- Regenerate reconciliation snapshot from runtime (monitor/orchestrator cycle).
- Only then proceed with signing decision.

## Always verify before signature
- chainId and contract address
- decoded function + args
- artifact bindings and preconditions
- deadline window is currently valid

## Never do
- never sign without decoded-call verification,
- never sign when artifact bundle is incomplete,
- never assume runtime has broadcast anything.

Related docs:
- [PRIME_ARCHITECTURE.md](./PRIME_ARCHITECTURE.md)
- [PRIME_UNSIGNED_TX_SPEC.md](./PRIME_UNSIGNED_TX_SPEC.md)
- [METAMASK_LEDGER_SIGNING_GUIDE.md](./METAMASK_LEDGER_SIGNING_GUIDE.md)
