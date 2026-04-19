# Prime Execution Order (Operational)

This is the practical sequencing for operating and extending Prime in this repository.

## 1) Preserve boundaries first
- No private keys in runtime.
- No signing/broadcast in runtime.
- No phase advancement without state + artifact evidence.

## 2) Read path before write path
1. Chain read/inspection (`prime-client`, `prime-inspector`, `prime-monitor`)
2. Phase derivation (`prime-phase-model`, `prime-next-action`)
3. Persist snapshots/state (`agent/artifacts/proc_<id>/`)

## 3) Then enable write preparation
1. Build phase artifacts (`prime-artifact-builder`)
2. Enforce preconditions (`prime-review-gates`, `prime-presign-checks`)
3. Build unsigned tx packages (`prime-tx-builder`, `prime-tx-validator`)
4. Stop at READY and wait for operator signing

## 4) Then bridge to execution
- On winner selection, use `prime-execution-bridge` into job execution flow.
- Keep Prime state and linked job artifacts cross-referenced.

## 5) Then compounding and hardening
- Retrieval packet generation (`prime-retrieval`)
- Stepping-stone extraction and archive indexing
- Failure-mode hardening and reconciliation checks

See also:
- [PRIME_ARCHITECTURE.md](./PRIME_ARCHITECTURE.md)
- [PRIME_PHASE_MODEL.md](./PRIME_PHASE_MODEL.md)
- [IMPLEMENTATION_GAPS.md](./IMPLEMENTATION_GAPS.md)
