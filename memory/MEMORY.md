# MEMORY.md — Long-Term Distilled Context

_Last updated: 2026-04-07 (UTC)_

## System Trajectory
- April 2026 focus is **mainnet operational hardening** for AGIJobManager v1 + Prime procurement flows, with strict human-in-loop signing boundaries preserved.
- Recent work has prioritized eliminating runtime drift between canonical modules, hardening deterministic validation, and improving restart-safe execution behavior.

## Durable Lessons

### 1) Canonical-path discipline prevents silent breakage
- Module duplication across `core/` and `agent/` created drift risk; replacing legacy `core/*` stage implementations with thin re-export shims to canonical `agent/*` reduced divergence surface.
- Import-graph integrity checks caught missing runtime modules early (`evaluate.js`, `apply.js`, `confirm.js`) and should be considered mandatory before readiness claims.

### 2) Deterministic-first validation must stay scoped and practical
- Doctrine checks should target correctness-boundary files precisely to avoid noisy false positives.
- `Date.now()` usage for atomic temp-file naming is acceptable when used strictly for I/O uniqueness and not decision logic.

### 3) Signing boundary enforcement needs layered guardrails
- Legacy direct-signing entrypoints/scripts were quarantined to prevent accidental runtime key/broadcast paths.
- CI-level guardrails (`scripts/ci/guard_no_signing_runtime.js`) are now a key protection layer and should remain part of routine checks.

### 4) Prime readiness depends on artifact continuity, not single-step success
- Validator role discovery, stable scoring-input hashing, reveal-continuity checks, and review-root hash binding materially improve commit/reveal safety and auditability.
- READY handoff should continue requiring deterministic continuity verification before operator action.

### 5) v1 completion integrity is state + provenance coupled
- Persisted per-stage idempotency claims and receipt-finality/revert guards are required for restart-safe progression.
- Completion provenance bundle hashing is essential for contract-legible evidence at submission boundaries.

## Operator Calibration (Persistent)
- Technical operator preference: lead with state/impact, avoid noise, provide directional recommendations.
- Quiet heartbeat is correct behavior when no urgent action is required.
- Archive growth (reusable residue extraction) is a strategic priority, not optional polish.

## Open Continuity Items
- Keep capability archive indexing active (`archive/index/` now initialized; extraction cadence still needs consistent follow-through).
- Continue converting audit findings into deterministic checks and explicit artifact/state gates.
