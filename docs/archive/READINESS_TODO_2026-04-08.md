# Workflow Activation Readiness Plan (2026-04-08)

This file is the operator-facing readiness plan after reviewing the latest merged change:

- Merge commit: `5f2657e`
- PR commit: `46008e3` — "Add AGIJobManager v2 contract artifacts and activate adapter"

---

## 1) Last commit impact (what it did vs did not do)

### Done in last commit
- Added AGIJobManager v2 ABI artifact.
- Registered AGIJobManager v2 adapter in `contracts/registry.js`.
- Added v2 to contract validation targets.

### Not done in last commit
- No scheduled workflow rewiring to canonical runtime.
- No private-key env cleanup in scheduled workflows.
- No end-to-end v2 execution/completion verification.
- No Prime validator-lane completion.

**Bottom line:** v2 adapter presence is improved, but activation readiness remains **incomplete**.

---

## 2) Current readiness snapshot

| Track | Current status | Why blocked |
|---|---|---|
| AGIJob v1 applicant | ⚠️ Partial | Scheduled workflow still runs legacy path; private-key env still present in runtime workflow. |
| AGIJob v2 applicant | ⚠️ Partial | Adapter + ABI are present, but end-to-end v2 pipeline verification is missing. |
| Prime v1 applicant | ⚠️ Partial | Scheduled procurement workflow still runs legacy path; private-key env still present. |
| Prime v1 validator | ❌ Not ready | Deterministic scoring payload production is not fully wired end-to-end. |

---

## 3) Activation TODO by track

## AGIJob v1 (applicant lane)

### P0 — required before enabling schedule
- [ ] Rewire `.github/workflows/autonomous.yml` away from `AgiJobManager/loop.js` to canonical runner entrypoint.
- [ ] Remove `WALLET_PRIVATE_KEY` from scheduled runtime env.
- [ ] Ensure canonical runner env is complete and name-aligned (`RPC_URL`/`ETH_RPC_URL` mapping resolved).

### P1 — required for reliable supervision
- [ ] Add pre-run contract validation step (`node scripts/validate-contracts.mjs`).
- [ ] Add preflight checks for RPC + MCP reachability.
- [ ] Assert READY artifact bundle exists before any state promotion.

### Exit criteria
- [ ] One full scheduled cycle runs canonical path without invoking `AgiJobManager/*`.
- [ ] No signing key in runtime env.
- [ ] READY packet generation verified for apply + completion handoff.

---

## AGIJob v2 (applicant lane)

### P0 — required before enabling schedule
- [ ] Validate v2 `list_jobs/get_job` normalization end-to-end on live payloads.
- [ ] Verify v2 discover → evaluate → apply packet flow succeeds without format fallthrough.
- [ ] Ensure v2 allowlist/address config is present where tx packaging validates targets.

### P1 — required for operational confidence
- [ ] Add integration fixture for representative v2 job.
- [ ] Add per-version telemetry (`v1` vs `v2`) for discover/apply/assignment/completion rates.

### Exit criteria
- [ ] At least one v2 dry-run completes discover→apply package path with no schema errors.
- [ ] Version-specific metrics are emitted and persisted.

---

## Prime v1 (applicant + validator lanes)

### P0 — required before enabling schedule
- [ ] Rewire `.github/workflows/procurement.yml` away from `AgiPrimeDiscovery/run_procurement_once.js` to canonical `agent/prime-*` entrypoint.
- [ ] Remove `AGENT_PRIVATE_KEY` from scheduled runtime env.
- [ ] Enforce READY-stop behavior: CI/runtime cannot auto-advance past operator gates.

### P1 — required for validator readiness
- [ ] Implement deterministic score payload producer for `scoreCommit/scoreReveal`.
- [ ] Wire validator evidence pipeline so payload generation is reproducible from artifacts.
- [ ] Add continuity guard to verify reveal payload matches prior commit hash material.

### Exit criteria
- [ ] Applicant lane completes discovery→ready handoff with receipt-driven transitions only.
- [ ] Validator lane can perform commit/reveal preparation with deterministic payload artifacts.

---

## 4) Cross-cutting gates (global)

### Governance / safety
- [x] Canonical runtime only in scheduled workflows. _(PR #93: rewired autonomous.yml + procurement.yml)_
- [x] No signing/broadcast codepath reachable from scheduled runtime. _(PR #93: removed WALLET_PRIVATE_KEY / AGENT_PRIVATE_KEY)_
- [ ] Operator handoff manifests include decoded call + freshness + simulation checks.

### Reliability
- [x] Restart test passes from disk state only (kill mid-phase, recover deterministically). _(PR #96: 59 restart/reorg/integration tests)_
- [x] Reorg continuity test passes for procurement cursor/state rollback. _(PR #96: Section E reorg tests)_
- [x] Import-graph sanity check ensures no drift to stale runtime modules. _(PR #94: fixed core/ re-exports)_

### Operations
- [x] Runbook updated with go-live, rollback, and emergency pause procedure. _(docs/AGIJOB_OPERATOR_RUNBOOK.md + existing PRIME_OPERATOR_RUNBOOK.md)_
- [x] Mission-control view includes `READY -> SIGNED -> BROADCAST -> FINALIZED` status lane. _(classifyLifecycleStage + /api/tx-lifecycle + OperationsLane.jsx)_

---

## 5) Suggested execution order

1. ~~Workflow rewiring (v1 + Prime) and private-key env removal.~~ Done (PR #93)
2. ~~Env alignment + preflight checks.~~ Done (PR #94)
3. ~~v2 end-to-end normalization and packet validation.~~ Done (PR #94)
4. ~~Prime validator deterministic payload wiring.~~ Done (PR #95)
5. ~~Restart/reorg/integration tests.~~ Done (PR #96)
6. ~~Operator runbook + mission-control lifecycle lane.~~ Done (this PR)

If any P0 item is open, **do not enable unattended schedules**.
