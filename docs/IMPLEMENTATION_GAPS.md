# Implementation Gaps (Live)

This file is the present-tense gap tracker. No historical notes.

## Runtime gaps

- **[PARTIALLY RESOLVED]** End-to-end deterministic validation coverage is uneven across job lanes.
  - Job-v1 and job-v2 are now substantially covered: `recovery.js` handles `deliverable_ready` and
    `completion_pending_review` restart cases; `submit.js` gates on both file existence and schema field
    presence (`ARTIFACT_REQUIRED_FIELDS`); `state.js` allows the `completion_pending_review →
    deliverable_ready` rollback transition; `reconcile-completion.js` normalises the
    `completionArchiveRecord` schema across both branches and guards extraction behind an artifact
    existence check.
  - Remaining: `agent/prime-orchestrator.js` (main Track B path) has no recovery pass at all.
    `agent/prime-v1/prime-orchestrator.js` has `recoverAll()` but it only corrects chain-phase
    discrepancies (commit/reveal submitted but not on-chain) — it does not check artifact-level
    completeness after a crash.

- **[PARTIALLY RESOLVED]** Artifact schema standardization is mixed across legacy and newer modules.
  - Resolved: `artifact-manager.js` now exports `ARTIFACT_REQUIRED_FIELDS` and `validateArtifactShape`
    as shared canonical helpers used by all job-v1/v2 paths. `prime-artifact-builder.js` now writes
    `schema` identifiers on all prime phase artifacts (`prime-trial-artifact-manifest/v1`,
    `prime-completion-manifest/v1`, `stake-preflight/v1`). `saltHash` renamed to canonical `salt` in the
    score commit payload. `signing-manifest/v1` now includes `warnings`, `instruction`, and `files` list
    to match the `prime-review-manifest/v1` shape.
  - Remaining: `agent/prime-orchestrator.js` (main) does not call `writeCompletionBundle` in its
    `handleBuildCompletionTx` handler — completion phase artifacts are only generated in the prime-v1
    path. The divergence in artifact completeness between prime paths is unresolved.

## Prime gaps

- **[RESOLVED]** Validator scoring lifecycle support is present and the operator runbook now covers all
  primary failure and deadline edge cases. `docs/PRIME_OPERATOR_RUNBOOK.md` contains: deadline severity
  bands (< 4 h, < 1 h, expired), explicit score-commit-generation failure steps, score-reveal continuity
  mismatch steps, validator-window-expired procedure, and chain-phase-advancement recovery steps.

- **[STILL OPEN]** Some prime phase artifacts are generated inconsistently across paths.
  `agent/prime-orchestrator.js` imports `writeInspectionExtras`, `writeApplicationBundle`,
  `writeRevealBundle`, `writeFinalistBundle`, and `writeTrialBundle` but does NOT import or call
  `writeCompletionBundle`. `agent/prime-v1/prime-orchestrator.js` imports and uses all six writers.
  Retrieval packet failures are logged as `(non-fatal)` in both prime orchestrators while the job-v1
  path hard-blocks on a missing retrieval packet in `assertArtifactBundleReady`.

## Mission Control gaps

- **[STILL OPEN]** Dashboard/operator state and local artifact state are not a single canonical source
  of truth. The Mission Control UI is fully API-mediated; `PRIME_OPERATOR_RUNBOOK.md` explicitly states
  that local persisted state and artifacts remain canonical and describes a manual reconciliation
  procedure using `reconciliation_snapshot.json`. No unified implementation exists.

- **[PARTIALLY RESOLVED]** Some operator actions still rely on local/manual file inspection.
  `OperationsLane.jsx` renders checklist items from review manifests (up to 8 displayed) and
  `JobDetail.jsx` surfaces `Open review manifest` / `Open unsigned tx` buttons for every tx candidate.
  Both `signing-manifest/v1` and `prime-review-manifest/v1` now carry a `checklist` array and
  `instruction` field.
  Remaining: `stake_preflight.json` still defaults to `hasSufficientBalance: false` and requires the
  operator to edit the file manually before the finalist gate will pass. The checklist display is capped
  at 8 items in the UI.

## Validation / retrieval / compounding gaps

- **[PARTIALLY RESOLVED]** Retrieval-before-generation is enforced for job-v1 completion packaging
  (`assertArtifactBundleReady` in `submit.js` requires `retrievalPacketPath` to exist and pass schema
  validation). Both prime orchestrators still treat retrieval packet failures as non-fatal and do not
  block tx building on a missing retrieval packet.

- **[STILL OPEN]** Stepping-stone extraction and archive indexing are not consistently required at
  terminal completion. `reconcile-completion.js` makes stepping-stone extraction mandatory for job-v1/v2
  (throws on a missing `jobCompletion` artifact). `prime-v1/prime-orchestrator.js` marks stepping-stone
  extraction calls as `(non-fatal)` — failure is logged but does not block completion. The main
  `prime-orchestrator.js` has no stepping-stone extraction at the completion phase handler.
