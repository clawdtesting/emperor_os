# Protocol Runtime Refactor Migration (2026-04-17)

## Summary
This refactor establishes a protocol-driven runtime with explicit protocol split (`protocols/v1`, `protocols/prime`) and a shared execution substrate (`runtime/*`). Legacy `agent/*` orchestration remains present for backward compatibility, but dominant execution entrypoints now route through `app/*` + runtime pipeline runner.

## Old → New Mapping

### Shared runtime extracted from `agent/`
- `agent/lock.js` -> `runtime/state/state-lock.js` (re-export shim)
- `agent/recovery.js` -> `runtime/state/recovery.js` (re-export shim)
- `agent/state-retention.js` -> `runtime/state/retention.js` (re-export shim)
- `agent/state.js` (mixed legacy state machine) -> `runtime/state/store.js` (generic protocol state store)
- `agent/artifact-manager.js` -> `runtime/artifacts/artifact-manager.js` (canonical artifact gate aware)
- `agent/pre-sign-checks.js` -> `runtime/tx/pre-sign-checks.js` (re-export shim)
- `agent/simulation.js` -> `runtime/tx/simulation.js` (re-export shim)
- `agent/signing-manifest.js` -> `runtime/tx/signing-manifest.js` (re-export shim)
- `agent/tx-validator.js` -> `runtime/tx/tx-validator.js` (re-export shim)
- `agent/ipfs-verify.js` -> `runtime/publish/ipfs-verify.js` (re-export shim)
- `agent/mcp.js` -> `runtime/chain/mcp.js` (re-export shim)
- `agent/rpc.js` -> `runtime/chain/rpc.js` + `runtime/chain/contract-readers.js`
- `agent/build-brief.js` -> `runtime/llm/brief-builder.js` (re-export shim)
- `agent/templates.js` -> `runtime/llm/templates.js` (re-export shim)

### v1 lifecycle to protocol pipeline
- `agent/discover.js` -> `protocols/v1/stages/discover.js`
- `agent/evaluate.js` -> `protocols/v1/stages/evaluate.js`
- `agent/apply.js` -> `protocols/v1/stages/apply.js`
- `agent/confirm.js` -> `protocols/v1/stages/confirm.js`
- `agent/execute.js` -> `protocols/v1/stages/execute.js`
- `agent/validate.js` -> `protocols/v1/stages/validate.js`
- `agent/publish.js` -> `protocols/v1/stages/publish.js`
- `agent/submit.js` -> `protocols/v1/stages/submit.js`
- `agent/reconcile-completion.js` -> `protocols/v1/stages/reconcile.js`
- `agent/tx-builder.js` -> `protocols/v1/tx/build-completion-tx.js`

### Prime orchestration to protocol state machine + pipeline
- `agent/prime-phase-model.js` -> `protocols/prime/phase-model.js`
- `agent/prime-state.js` -> `protocols/prime/state-machine.js` + `runtime/state/store.js`
- `agent/prime-orchestrator.js` -> `protocols/prime/pipeline.js`
- `agent/prime-validator-scoring.js` -> `protocols/prime/scoring/*`
- `agent/prime-tx-builder.js` -> `protocols/prime/tx/*`
- `agent/prime-review-gates.js` and `agent/prime-presign-checks.js` -> `protocols/prime/guards.js` + `runtime/tx/pre-sign-checks.js`

## Entrypoint changes
- `loops/AGIJobManager-v1/runner.js` now shims to `app/daemon.js`.
- `loops/AGIJobManager-v1/daemon.js` now shims to `app/daemon.js`.
- New entrypoints:
  - `app/runner.js` (single routed run)
  - `app/daemon.js` (looping daemon)
  - `app/cli.js` (JSON-driven runtime invocation)

## Deleted / merged / legacy status
- Deleted: none in this pass (intentional safety-first migration).
- Merged: protocol truth moved into `protocols/*` and runtime services in `runtime/*`.
- Legacy retained as shims:
  - `agent/*` modules still exist for mission-control/script compatibility.
  - TODO: retire old orchestrators after all mission-control scripts import runtime/protocol modules directly.

## Intentional compromises
1. Existing production `agent/*` modules are retained to minimize operational risk while introducing new architecture.
2. Runtime and protocol modules are implemented in ESM JavaScript (repo-native), not TypeScript, to avoid introducing a partial TS toolchain mid-refactor.
3. Prime pipeline uses deterministic stage flow with explicit guards; additional production-specific chain synchronization can be layered into stage implementations without changing architecture.
