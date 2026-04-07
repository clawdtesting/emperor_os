# System Health Review — 2026-04-07

## Executive verdict

**State:** Partially healthy.

- The repository architecture is coherent and well-documented, and several core surfaces are operational.
- There are still execution gaps that prevent calling the **entire** system "fully healthy" right now.

## What was checked

1. Startup protocol continuity files and state surfaces.
2. Top-level folder structure and role mapping from project docs.
3. Runnable checks on available test/build scripts.

### Commands run

- `npm -C AgiJobManager test` → fails (`Missing script: test`).
- `npm -C AgiPrimeDiscovery test` → fails (`Missing script: test`).
- `npm -C core test` → fails (`Missing script: test`).
- `npm -C lobster test` → fails (53 pass / 13 fail; shell compatibility failures and runtime assertion failures).
- `npm -C mission-control test` → fails (`Missing script: test`).
- `npm -C mission-control run build` → passes.
- `node validation/validation.test.js` → fails (missing runtime dependency: `ethers`).
- `node employer-validation/employer-validation.test.js` → passes (14/14).

## Folder-by-folder status

Legend: **Working**, **Partial**, **Not working yet**, **Docs/State**

| Folder | Purpose | Status | Why | What to do next |
|---|---|---|---|---|
| `.github/`, `github/` | CI/workflow automation | **Partial** | Workflows exist per repo docs, but this run did not execute CI remotely. | Run full CI on branch and archive run artifacts. |
| `.openclaw/` | OpenClaw gateway config | **Partial** | Present in architecture docs; not runtime-validated in this check. | Add deterministic config lint/smoke check in CI. |
| `agent/` | Prime execution substrate + state/artifacts | **Partial** | State surfaces exist; active job/proc state currently minimal. | Add smoke test for core prime loop entrypoints. |
| `AgiJobManager/` | v1 job loop | **Partial** | Start script exists; no `test` script present. | Add minimal regression test command and CI hook. |
| `AgiPrimeDiscovery/` | Prime procurement agent | **Partial** | Package exists but no scripts defined. | Add `start`, `test`, and at least one deterministic dry-run check. |
| `core/` | Legacy/shim execution layer | **Partial** | Start script exists; no test script for regressions. | Add shim integrity tests to prevent drift. |
| `lobster/` | Deterministic workflow engine | **Not working yet** | Test suite currently fails (13 failures), many tied to `/bin/sh` incompatibilities and some runtime assertions. | Make workflow/test shell usage POSIX-safe or force bash; then fix remaining assertion failures and gate via CI. |
| `mission-control/` | Operator UI + API | **Partial** | Production build succeeds; no test script. | Add frontend/API tests and include in CI. |
| `validation/` | Contract1 dry-run + validator lifecycle tests | **Not working yet (in this env)** | Test run fails because `ethers` package is unavailable to runtime. | Install/declare dependency in the executed environment (or local package scope), then re-run tests. |
| `employer-validation/` | Employer-side review/scoring | **Working** | Test suite passes 14/14. | Keep as reference quality bar; wire into CI if not already. |
| `audits/` | Audit framework + checks + reports | **Partial** | Rich structure and docs exist; this pass did not run full audit matrix. | Add a single command to run critical doctrine checks end-to-end. |
| `archive/` | Capability archive/index | **Docs/State** | Index structure exists; no integrity check run. | Add archive index validation command (schema + reference checks). |
| `memory/` | Session continuity | **Working** | Daily and long-term memory files present and populated. | Continue discipline; keep heartbeat timestamps current. |
| `workspace/` | Operational home/heartbeat | **Partial** | `workspace/HEARTBEAT.md` is currently missing. | Recreate HEARTBEAT file (or define alternate canonical location) to satisfy startup protocol. |
| `scripts/` | CI and utility scripts | **Partial** | Utilities present; not fully exercised in this review. | Add script inventory doc + `scripts/ci` smoke runner. |
| `tests/` | End-to-end/manual fixtures | **Partial** | Test fixtures/directories present; not executed in this pass. | Define one orchestrated test runner with selectable suites. |
| `docs/` | Doctrine and architecture | **Working** | Detailed architecture/doctrine docs present. | Keep aligned with actual runtime scripts/tests. |
| `ToDo/`, `agent/artifacts/`, `agent/state/` | Operational planning and durable artifacts/state | **Working (as data surfaces)** | Directories exist and align with doctrine emphasis on persisted artifacts/state. | Add schema validation for all state.json transitions. |

## Highest-priority fixes

1. **Stabilize Lobster tests** (shell portability + failing assertions).
2. **Restore validation test runtime** by ensuring `ethers` is resolvable where tests run.
3. **Normalize script contracts** (`start/test/build`) across `AgiJobManager`, `AgiPrimeDiscovery`, `core`, `mission-control`.
4. **Reinstate heartbeat file contract** (`workspace/HEARTBEAT.md`) or update doctrine/docs consistently if relocated.
5. **Create one top-level health command** that runs the critical checks and returns pass/fail deterministically.

## Bottom line

If your question is "can this system run real workflows with operator oversight?" — **yes, partially**.

If your question is "is every major folder currently test-backed and green?" — **no**.

The gaps are fixable and mostly operational (test harness consistency, environment/dependency alignment, and shell portability), not architectural.
