# Mainnet Readiness Audit — AGIJobManager + AGIJobDiscoveryPrime

Date: 2026-04-04  
Scope: `agent/`, `core/`, `mission-control/`, `AgiJobManager/`, `AgiPrimeDiscovery/`

## Executive Verdict

| Area | Verdict | Rationale |
|---|---|---|
| AGIJobManager applicant readiness | Partially ready | Core discovery→evaluate→apply→execute→completion packaging exists, but receipt/finality-driven progression and unattended reliability controls are incomplete. |
| AGIJobManager validator readiness | Not ready | No canonical validator assignment/evidence/scoring action path exists in active runtime. |
| Prime applicant readiness | Partially ready | Monitor + orchestrator + phase-aware tx packaging are substantial, but key action confirmation still relies on inferred phase/manual coordination in places. |
| Prime validator readiness | Not ready | Validator commit/reveal scaffolding exists, but role detection + scoring payload generation + full orchestration are not wired end-to-end. |
| Unsigned transaction safety readiness | Partially ready | Strong doctrine and many checks exist, but uniform enforcement (simulation/freshness/selectors) is not complete across all Prime tx types. |
| Restart/state-machine readiness | Partially ready | Atomic state, lock, and cursors exist; deterministic replay/idempotency and reorg-hardening remain incomplete for unattended mainnet runtime. |
| Mission Control operator readiness | Partially ready | Useful observability and helper decoding exist, but it is not yet a robust signed-tx lifecycle control lane. |

## Canonical Runtime Path vs Stale Paths

- **Canonical runtime path (source of truth):** `agent/*` for orchestration/state/actions, with shared safety/utility modules via `core/*` re-exports.
- **Operator surface path:** `mission-control/*` (read/assist UI and API proxy).
- **Stale/legacy paths:** `AgiJobManager/*` and `AgiPrimeDiscovery/*` include historical direct-signing assumptions; currently disabled/inconsistent with unsigned-only doctrine.

---

## AGIJobManager Applicant Audit

### What exists (wired)
1. Job discovery + local state enqueue + artifact initialization.
2. Deterministic scoring/fit strategy and state transitions.
3. Unsigned apply package generation with approve/apply selector checks.
4. Assignment detection from remote job reads.
5. Execution pipeline with briefing + output validation.
6. Completion metadata/IPFS packaging + unsigned completion tx + pre-sign decode/sim checks.
7. Reconciliation polling for submitted/completed/disputed states.

### What is partial
- Some stage advancement is state-observation-based rather than receipt/finality-bound.
- Recovery model is practical but not a full deterministic replay journal.
- Exactly-once guarantees are not enforced by explicit idempotency tokens.

### Missing for reliable mainnet unattended operation
- Required tx-hash ingestion and finalized receipt checks before state advancement.
- Per-step idempotency keys and duplicate-action suppression.
- Hard failure gates for stale unsigned packages and out-of-window transitions at every step.

---

## AGIJobManager Validator Audit

### Current state
- Canonical `agent/` job pipeline contains no validator role lifecycle branch.
- No validator evidence fetch, scoring adjudication, score tx handoff, or validator settlement reconciliation found.

### Verdict
- **Not implemented (not ready)**.

---

## Prime Applicant Audit

### What exists (wired)
1. Procurement detection via event scans with persisted monitor cursors.
2. Deadline/phase derivation and next-action computation.
3. Inspection + fit evaluation artifacts and gates.
4. Commit/reveal/finalist/trial/completion unsigned tx builders + READY packets.
5. Trial publication + fetch-back verification prior to submission handoff.
6. Winner evidence collection + reconciliation helpers.

### What is partial
- Several "submitted" assumptions can still be inferred from phase/app view instead of mandatory receipt ingestion.
- Multi-step sequences (e.g., approval + accept) are operator-fragile without strict dependency checkpoints.
- Reorg-resilient cursor correction is limited.

### Missing for reliable mainnet unattended operation
- Uniform receipt/finality ingestion for every irreversible handoff action.
- Reorg-aware event cursor rollback/repair strategy.
- Strict idempotent, replay-safe cross-deadline orchestration.

---

## Prime Validator Audit

### What exists
- Validator statuses and transitions are represented in phase model.
- Unsigned `scoreCommit` and `scoreReveal` package builders exist.
- Orchestrator contains validator action handlers.

### Critical missing wiring
- No canonical runtime producer found for `validatorScoreCommitPayload` / `validatorScoreRevealPayload`.
- No end-to-end deterministic validator scoring/evidence pipeline.
- Selector policy in Prime tx validator remains incomplete for `scoreCommit` and `scoreReveal`.

### Verdict
- **Scaffolded but not operationally ready**.

---

## Safety and Signing Audit

### Strong today
- Active path follows unsigned-handoff model.
- Legacy AGIJobManager broadcast helpers are disabled.
- Core decode/allowlist/simulation checks exist for AGIJobManager completion handoffs.

### Partial today
- Simulation/freshness requirements are not uniformly mandatory on every Prime tx type.
- Repo-wide static/CI anti-signing enforcement is not fully hardened.
- Legacy folders still carry conflicting historical assumptions.

---

## State / Persistence / Orchestration Audit

### Strong today
- Atomic JSON writes for job and procurement state files.
- Process lock for singleton runtime.
- Monitor cursor persistence across restarts.
- Explicit transition validation in Prime status machine.

### Gaps
- Recovery still includes heuristic corrections in some paths.
- Exactly-once semantics not enforced uniformly.
- Unattended multi-day operation remains below strict production confidence threshold.

---

## Mission Control Audit

### Useful today
- Prime contract read views.
- Next-action helper reads and decoded guidance cards.
- Event scan tooling and quick context for job/procurement IDs.

### Gaps
- Primarily observational; not a full execution control plane for signed tx lifecycle.
- Some action-code mappings are inferred, which can mislead at high-stakes edges if not kept synchronized with protocol truth.

### Required upgrades for operational supervision
1. Add signed-tx lifecycle lane: `READY -> SIGNED -> BROADCAST -> FINALIZED` with timestamped acknowledgments.
2. Add per-procurement operator checklist completion + decision logging linked to ready packets.
3. Add alert rails for deadline-critical actions (<4h, <1h, expired) with acknowledgment requirement.
4. Add validation display for package freshness, simulation status, decoded selector, and artifact hash bindings.

---

## Top Mainnet Blockers (Priority)

1. Prime validator payload generation and role-wired scoring flow absent end-to-end.
2. AGIJobManager validator role pipeline absent in canonical runtime.
3. Incomplete selector-policy enforcement for Prime `scoreCommit`/`scoreReveal` validation.
4. Non-uniform mandatory simulation/freshness enforcement across all Prime tx packages.
5. Receipt/finality ingestion not uniformly required before status progression.
6. Reorg-resilient monitor cursor strategy incomplete.
7. Cross-phase replay/idempotency guarantees incomplete for unattended operation.
8. Mission Control lacks robust operator action lane for tx package lifecycle management.
9. Legacy path ambiguity (deprecated folders with conflicting assumptions) increases operational confusion risk.
10. Artifact integrity binding is strong in places but not uniformly anchored for every irreversible handoff.

---

## Build Plan

### Phase 1 — AGIJobManager applicant minimum
1. Add required tx hash + receipt ingestion + finality checks for apply/completion handoffs.
2. Add idempotency keys for each pipeline stage.
3. Harden completion reconciliation with deterministic provenance.

**Acceptance criteria**
- No state transition to `assigned/submitted/completed` without an associated finalized receipt reference.
- Duplicate cycle replay does not generate duplicate side effects.
- Every completion handoff contains a deterministic provenance bundle hash.

### Phase 2 — Prime applicant minimum
1. Make commit/reveal/finalist/trial/completion transitions receipt-driven.
2. Enforce simulation + expiry checks for all Prime unsigned tx types.
3. Add reorg-aware cursor reconciliation and rollback logic.

**Acceptance criteria**
- READY->SUBMITTED transitions require explicit receipt ingestion.
- Any expired package is hard-rejected pre-handoff.
- Event index can recover deterministically after simulated reorg tests.

### Phase 3 — Prime validator minimum
1. Implement validator role discovery and persistence.
2. Implement deterministic scoring + payload artifact builder.
3. Wire score commit/reveal progression with strict continuity checks.

**Acceptance criteria**
- Validator actions only unlock when role assignment is chain-confirmed.
- Reveal payload must verify against previously committed score hash.
- Validator lifecycle can run end-to-end in restart simulation without manual state surgery.

### Phase 4 — Mainnet hardening
1. CI guardrails to forbid signing/broadcast primitives in runtime code.
2. Unified artifact-root hash binding in every ready packet.
3. Chaos/restart tests for missed windows, delayed polling, and partial-state recovery.

**Acceptance criteria**
- CI fails on signing primitive usage in canonical runtime paths.
- Every irreversible handoff has a single review-root hash.
- Multi-day unattended dry run passes with deterministic recovery logs.

---

## Bottom Line

- AGIJobManager apply reliability: **Partial**.
- AGIJobManager complete reliability: **Partial**.
- Prime applicant end-to-end reliability: **Partial**.
- Prime validator end-to-end reliability: **No**.
- Safe unattended mainnet operation under unsigned-only doctrine: **No-go today**.

Supervised human-in-loop operation remains feasible with explicit operator discipline and tight checklists, but current state should not be treated as fully production-autonomous mainnet ready.
