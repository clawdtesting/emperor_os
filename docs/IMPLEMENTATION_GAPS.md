# IMPLEMENTATION GAPS — VERIFIED STATE

## Summary

- Total gaps: 12
- Resolved: 2
- Partially resolved: 8
- Still open: 2
- Outdated: 0

The repository now has strong compounding primitives (retrieval packet generation, stepping-stone extraction, archive indexing, and idempotent terminal compounding records), and v1 completion packaging enforces retrieval + completion archive artifacts before state advancement. The remaining readiness risk is cross-lane consistency: guarantees are strict in some runtime paths and advisory or absent in others, especially across Prime orchestrator variants and Mission Control/operator workflows.

---

## 1. Runtime Gaps

### Gap: v1 completion packaging enforces retrieval + artifact schema before submission

- Status: RESOLVED
- Reality:
  `agent/submit.js` hard-fails if execution validation, publication validation, retrieval packet, deliverable, or brief artifacts are absent. It then validates required JSON fields (including retrieval packet fields) before completion metadata upload and unsigned completion tx staging.
- Missing enforcement:
  None in the v1 `submit.js` lane for completion packaging.
- Evidence:
  `assertArtifactBundleReady()` requires retrieval packet path + schema fields; `submit()` validates `jobCompletion` and `completionArchiveRecord` before state transition.
- Required action:
  None for this lane.

### Gap: Terminal completion compounding is mandatory in v1 completion path

- Status: RESOLVED
- Reality:
  v1 completion path calls `ensureTerminalCompoundingArtifacts()` and validates the resulting `completion_archive_record.json` before writing `completion_pending_review` state.
- Missing enforcement:
  None in this lane.
- Evidence:
  `agent/submit.js` calls `ensureTerminalCompoundingArtifacts(...)`, then `validateArtifactShape(...completionArchiveRecord...)`, then updates state.
- Required action:
  None for this lane.

### Gap: Retrieval-before-generation guarantee is not uniform across runtime content generation surfaces

- Status: PARTIALLY RESOLVED
- Reality:
  Prime content generators (`generateApplicationContent`, `generateTrialContent`, `generateCompletionSummary`) explicitly call retrieval packet creation before generating markdown.
- Missing enforcement:
  The guarantee is function-level, not universal runtime policy; alternate/manual generation paths can still bypass these helpers.
- Evidence:
  `agent/prime-content.js` invokes `ensureRetrievalPacketForProc(...)` in all three generation functions.
- Required action:
  Add a shared enforcement gate requiring retrieval packet presence before any content artifact write, regardless of entrypoint.

### Gap: Deterministic recovery guarantees are uneven between primary runtime lanes

- Status: PARTIALLY RESOLVED
- Reality:
  Artifact/state discipline is strong in v1 completion packaging and bridge checks, but `agent/prime-orchestrator.js` does not include a generalized recovery pass equivalent to the older Prime v1 recover flow.
- Missing enforcement:
  Crash recovery and artifact reconstitution are not uniformly formalized in the current main Prime orchestrator path.
- Evidence:
  `agent/prime-orchestrator.js` advances via next-action dispatch but has no global `recoverAll()`/phase-repair pre-pass.
- Required action:
  Implement deterministic pre-dispatch recovery sweep for Prime main lane (artifact completeness + state/chain continuity checks).

---

## 2. Prime Gaps

### Gap: Prime completion bundle production is inconsistent with completion gate requirements

- Status: STILL OPEN
- Reality:
  Completion gate requires `completion/job_completion.json`, `completion/publication_record.json`, and `completion/fetchback_verification.json` with `verified=true`.
- Missing enforcement:
  Main orchestrator `handleBuildCompletionTx` does not call `writeCompletionBundle()`, and does not produce those required completion artifacts itself; it generates `completion_summary.md` and compounding record only.
- Evidence:
  `agent/prime-review-gates.js` (`assertCompletionGate`) requires files; `agent/prime-artifact-builder.js` has `writeCompletionBundle()` writer; `agent/prime-orchestrator.js` does not import/call `writeCompletionBundle()`.
- Required action:
  Wire `writeCompletionBundle()` into `handleBuildCompletionTx` (or equivalent canonical writer) before gate evaluation.

### Gap: Retrieval packet enforcement differs between Prime main and Prime v1 orchestrators

- Status: PARTIALLY RESOLVED
- Reality:
  Main Prime orchestrator uses `ensureRetrievalPacketForProc()` in trial/completion handlers (hard call, no local catch). Prime v1 orchestrator treats retrieval creation failure as non-fatal in application/fit/trial.
- Missing enforcement:
  Retrieval is not uniformly fail-closed across all Prime execution lanes.
- Evidence:
  `agent/prime-orchestrator.js` uses `ensureRetrievalPacketForProc(...)`; `agent/prime-v1/prime-orchestrator.js` logs `retrieval packet failed (non-fatal)` in multiple handlers.
- Required action:
  Standardize fail-closed retrieval packet requirement for all Prime orchestrator variants, or formally deprecate one lane.

### Gap: Terminal stepping-stone extraction at completion is inconsistent across Prime lanes

- Status: PARTIALLY RESOLVED
- Reality:
  Main Prime orchestrator completion path calls `ensureTerminalCompoundingArtifacts(...)`. Prime v1 uses non-fatal stepping-stone extraction patterns in trial flow and does not enforce terminal completion extraction in `handleBuildCompletionTx`.
- Missing enforcement:
  Completion-time archive extraction is not guaranteed in every Prime lane.
- Evidence:
  `agent/prime-orchestrator.js` completion handler includes `ensureTerminalCompoundingArtifacts(...)`; `agent/prime-v1/prime-orchestrator.js` has non-fatal extraction logging and completion tx build path without terminal compounding enforcement.
- Required action:
  Make completion-stage compounding mandatory in Prime v1 or retire the path.

### Gap: Prime retrieval packet coverage by phase is incomplete in main orchestrator dispatch

- Status: PARTIALLY RESOLVED
- Reality:
  Main orchestrator ensures retrieval packets in trial and completion handlers. Application retrieval is currently performed inside `generateApplicationContent()` rather than enforced at orchestrator handler boundary.
- Missing enforcement:
  Retrieval requirement is indirectly satisfied for application path, not explicitly asserted at the orchestrator phase level.
- Evidence:
  `agent/prime-orchestrator.js` `handleDraftApplication` calls `generateApplicationContent()` directly; retrieval occurs internally in `agent/prime-content.js`.
- Required action:
  Add explicit retrieval artifact assertion in handler before/after generation to keep phase-level enforcement legible.

---

## 3. Mission Control Gaps

### Gap: Backend readiness metadata exists, but operator workflow still depends on raw filesystem inspection

- Status: PARTIALLY RESOLVED
- Reality:
  UI exposes queue stages, review-manifest parsing, checklist snippets, and buttons to inspect raw manifest/tx files.
- Missing enforcement:
  Operator still needs raw artifact-file inspection for correctness decisions; UI does not replace canonical filesystem/state verification.
- Evidence:
  `mission-control/src/components/OperationsLane.jsx` includes `Inspect raw manifest` and `Inspect raw tx`; `docs/PRIME_OPERATOR_RUNBOOK.md` states local persisted state/artifacts remain canonical and uses `reconciliation_snapshot.json` for parity.
- Required action:
  Add explicit in-UI artifact integrity status sourced from runtime gate checks; preserve raw access but reduce manual cross-check burden.

### Gap: Checklist exposure is present but truncated in UI, reducing full operator visibility

- Status: PARTIALLY RESOLVED
- Reality:
  Mission Control summarizes checklist arrays, but rendering truncates to first 4 items in row view and 8 in manifest summary.
- Missing enforcement:
  Full checklist review is not guaranteed in default UI surfaces.
- Evidence:
  `OperationsLane.jsx` slices checklist arrays (`slice(0, 4)` in row, `slice(0, 8)` in summary parser).
- Required action:
  Provide expandable full checklist + completion acknowledgement state before transition actions.

### Gap: Finalist stake preflight remains manual/operator-edited

- Status: STILL OPEN
- Reality:
  Prime finalist gate requires `stake_preflight.hasSufficientBalance=true` and `allowanceSufficient=true`, while bundle defaults and runbook indicate operator must manually confirm/update values.
- Missing enforcement:
  No deterministic auto-check path currently marks these fields true from chain balance/allowance proof.
- Evidence:
  `agent/prime-review-gates.js` hard-requires true fields; `agent/prime-artifact-builder.js` warnings note defaults block gate; runbook/manual flows depend on operator intervention.
- Required action:
  Implement read-only chain preflight checker that writes signed-off evidence and updates preflight flags deterministically.

---

## 4. Validation / Retrieval / Compounding

### Gap: Retrieval is enforced before completion packaging in v1, but not uniformly before generation in all lanes

- Status: PARTIALLY RESOLVED
- Reality:
  v1 completion packaging (`submit.js`) blocks on retrieval packet existence + schema validation. Prime content generators create retrieval packets before generation. Prime v1 contains non-fatal retrieval error handling.
- Missing enforcement:
  Cross-lane invariant “no generation without retrieval packet” is not fail-closed across Prime v1/manual paths.
- Evidence:
  `agent/submit.js`, `agent/prime-content.js`, `agent/prime-v1/prime-orchestrator.js`.
- Required action:
  Promote a shared retrieval precondition utility and require it in every lane before generation/publish/build-tx steps.

### Gap: Retrieval packet canonical persistence exists but is not universally consumed as a gate artifact

- Status: PARTIALLY RESOLVED
- Reality:
  `ensureRetrievalPacketForProc()` always writes canonical retrieval packet files (including empty packets with reason), and v1 completion path validates retrieval packet shape.
- Missing enforcement:
  Some Prime gates do not require retrieval packet presence/validity as a blocking condition before tx package generation.
- Evidence:
  `agent/prime-retrieval.js` canonical write behavior; `agent/prime-review-gates.js` commit/reveal/finalist/trial/completion gates do not include retrieval packet checks.
- Required action:
  Add retrieval packet checks to relevant review gates where retrieval is a doctrinal prerequisite.

### Gap: Archive index updates are deterministic where terminal compounding helper is used, but helper usage is not universal

- Status: PARTIALLY RESOLVED
- Reality:
  `ensureTerminalCompoundingArtifacts()` verifies extracted archive ID exists in archive index and writes completion archive record idempotently. Compounding dry-run test validates deterministic index growth and idempotency.
- Missing enforcement:
  Lanes that do not call this helper at terminal completion do not inherit the guarantee.
- Evidence:
  `agent/prime-retrieval.js` (`ensureTerminalCompoundingArtifacts` + index assertion), `tests/test_compounding_dry_run/run.js` (idempotency and deterministic index assertions).
- Required action:
  Require helper invocation as a mandatory completion step in every terminal lane.

### Gap: Completion archive records are guaranteed in v1 and Prime-main completion handlers, but not across all operational paths

- Status: PARTIALLY RESOLVED
- Reality:
  v1 `submit.js` writes and validates completion archive record; Prime main completion handler invokes terminal compounding helper. Bridge path (`recordLinkedJobCompletion`) validates linked v1 retrieval + completion archive records before accepting completion URI.
- Missing enforcement:
  Prime v1 completion tx path does not enforce completion archive record creation at that stage.
- Evidence:
  `agent/submit.js`, `agent/prime-orchestrator.js`, `agent/prime-execution-bridge.js`, `agent/prime-v1/prime-orchestrator.js`.
- Required action:
  Enforce completion archive record generation/validation in Prime v1 completion path or deprecate that lane.

---

## System Readiness Assessment

- Overall readiness score: **78 / 100**

Breakdown:
- Runtime correctness: **84 / 100**
  - Strong artifact validation and terminal compounding in v1; remaining gap is uniform crash-recovery posture across Prime main lane.
- Prime lifecycle completeness: **72 / 100**
  - Phase model and gates are extensive, but completion artifact production mismatch and cross-orchestrator consistency gaps remain.
- Compounding flywheel maturity: **82 / 100**
  - Retrieval + archive + stepping-stone + idempotent completion record primitives are implemented and tested; enforcement is not universal across all lanes.
- Operator usability: **74 / 100**
  - Mission Control improves visibility but still requires filesystem-centric verification for critical sign decisions; checklist and stake-preflight UX remain incomplete.

Top 3 blocking risks before production:
1. **Prime completion artifact mismatch risk** — completion gate requires files that main completion handler does not currently generate itself.
2. **Cross-lane invariant drift risk** — Prime main vs Prime v1 enforce retrieval/compounding with different failure semantics.
3. **Operator workflow brittleness risk** — manual preflight edits + truncated checklist visibility can allow avoidable decision errors under time pressure.
