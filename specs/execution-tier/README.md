# Execution Tier Requirements (Canonical v1)

This directory is the Phase 0 canonicalization output for `docs/audits/EXECUTION_TIER_ARCHITECTURE.md`.

## Why this exists

The source markdown mixes numbered headings and free text in a way that is human-readable but not consistently machine-checkable. The normalized JSON artifact converts policy into explicit requirement IDs and acceptance-test IDs.

## Normalization rules used

- Every normative rule (`MUST`, `NEVER`, `ALWAYS`) is represented as a requirement object with:
  - stable requirement ID
  - category
  - normative level
  - machine-check metadata
  - linked acceptance test ID
- Additional gating rules (`DO NOT APPLY`, escalation-only-if) are also represented for completeness.
- Acceptance tests are represented one-to-one for all normative requirements and are cross-linked both directions.

## Ambiguities resolved

- **Heading structure ambiguity:** The source file includes unseparated section transitions (e.g., policy text flowing into section 4 labels). Canonical JSON now enforces explicit category boundaries.
- **Tier naming ambiguity:** `T4_ORCHESTRATED` appears as future scope; it is retained only in ordered evaluation metadata but not required by current protocol policy examples.
- **Margin expression ambiguity:** Equivalent expressions (`requiredMargin: 0.25` vs `>= 1.25x`) are normalized to `payoutUsd >= executionCostUsd * 1.25`.
- **Artifact path variability:** canonical path pattern fixed as `artifacts/job_<id>/...` for check definitions.

## Files

- `requirements.v1.json` — canonical machine-checkable requirement set.
- `requirements.schema.json` — schema contract for the canonical file.
- `tests/spec/execution-tier-requirements.test.js` — Phase 0 acceptance checks for completeness and mapping integrity.

## Phase 1 outputs

- `agent/execution-tier/policies.js` — domain model/config for protocol tier policy, job feature schema, archetype defaults, tier rule schema, and escalation policy schema.
- `agent/execution-tier/policy-engine.js` — deterministic accessors/enforcers over configuration data.
- `tests/execution-tier-phase1.test.js` — validates policy constraints and schema enforcement behavior.

## Phase 2 outputs

- `agent/execution-tier/feature-extractor.js` — deterministic extraction of required complexity features from normalized job specs.
- `agent/execution-tier/archetype-classifier.js` — rule-based archetype classification with reason payloads.
- `agent/execution-tier/complexity-score.js` — interpretable complexity score + component-level reasoning.
- `agent/execution-tier/tier-selector.js` — lowest-to-highest allowed-tier selection with rejection reasons for lower tiers.
- `tests/execution-tier-phase2.test.js` — scenario tests for feature extraction, classification, complexity scoring, tier selection, and explainability payloads.

## Phase 3 outputs

- `agent/execution-tier/economics.js` — deterministic execution-cost estimation, payout normalization, and margin-policy evaluation.
- `agent/execution-tier/apply-gate.js` — single `shouldApply` decision gate with structured rejection reasons.
- `tests/execution-tier-phase3.test.js` — checks execution feasibility, margin policy, validation feasibility, and confidence threshold gating.

## Phase 4 outputs

- `agent/execution-tier/runtime-guards.js` — hard model-call/token budget guardrails, repairability detection, and validation gate enforcement.
- `agent/execution-tier/runners.js` — tier-specific bounded runners for T1 one-shot, T2 repair-loop, and T3 planner-executor execution.
- `agent/execution-tier/escalation-controller.js` — bounded escalation policy controller.
- `agent/execution-tier/runtime-orchestrator.js` — end-to-end runtime execution with apply gate, bounded escalation, and pre-finalize validation gating.
- `tests/execution-tier-phase4.test.js` — verifies budget guards, validation gates, repairability behavior, escalation behavior, and orchestration outcomes.

## Phase 5 outputs

- `agent/execution-tier/state-machine.js` — explicit stage-machine integration with artifact gating, schema checks, and atomic state writes.
- Stage artifact requirements enforced before transition (`tier_selection.json`, `economic_check.json`, `apply_decision.json`, `validation.json`, `repair_logs.json`).
- Signing-boundary enforcement blocks private-key/signed-tx style payloads from execution-tier artifacts.
- `tests/execution-tier-phase5.test.js` — validates stage transitions, artifact/schema gating, atomic persistence behavior, and signing-boundary guards.

## Phase 6 outputs

- `agent/execution-tier/rollout.js` — phased rollout controller (`dry_run`, `shadow`, `enforce`) with telemetry for rejection reasons and margin outcomes.
- `tests/execution-tier-phase6.test.js` — invariants and rollout-mode simulation checks.
- `tests/execution-tier-replay.test.js` + `tests/fixtures/execution-tier/replay_jobs.json` — audit replay harness for comparing expected tier/apply decisions across historical fixtures.
