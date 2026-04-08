# whatisthis triage (2026-04-01)

Goal: keep AGIJobManager v1 runnable while preserving building blocks for AGI Prime v2.

## Moved to `core/whatisthis`
These were kept because they are executable modules, ABIs, package metadata, or operational docs that support v1 execution and/or v2 migration:

- `package.json`, `package-lock.json`
- Runtime/orchestration: `daemon.js`, `runner.js`, `orchestrator.js`, `discover.js`, `execute.js`, `submit.js`, `validate.js`, `evaluate.js`, `apply.js`, `confirm.js`, `publish.js`, `recovery.js`
- Transaction safety/signing: `tx-builder.js`, `tx-validator.js`, `tx-reconcile.js`, `signing-manifest.js`, `pre-sign-checks.js`, `simulation.js`, `lock.js`
- Job normalization/state: `job-normalize.js`, `state.js`, `state-retention.js`, `artifact-manager.js`, `build-brief.js`, `strategy.js`, `templates.js`
- Integration utilities: `rpc.js`, `mcp.js`, `config.js`, `ipfs-verify.js`, `abi-registry.js`
- ABI/assets: `AGIJobManager.json`, `ERC20.json`
- Process/ops docs retained as implementation guidance: `OPERATOR_INSTRUCTIONS.md`, `METAMASK_LEDGER_SIGNING_GUIDE.md`, `PRODUCTION_FAILURE_SCENARIOS.md`, `production_readiness_review_2026-03-30.md`, `preflight_real_job_checklist_2026-03-30.md`

## Moved to `junk/whatisthis`
These appear to be stale artifacts or placeholders and are not required to run the managers:

- Snapshot outputs: `get_job_0.json`, `get_job_1.json`, `get_job_3.json`, `get_job_4.json`, `get_job_5.json`, `get_job_6.json`, `get_job_8.json`, `get_job_11.json`, `list_jobs.json`
- Empty placeholders: `node`, `agent@1.0.0`

## Notes for v1/v2 path
- v1 AGIJobManager functionality is preserved by keeping all executable JS modules, package manifests, and ABI files in `core/whatisthis`.
- v2 AGI Prime work can reuse `strategy.js`, validation/signing pipeline modules, and retained operational docs without dragging in stale JSON snapshots.
