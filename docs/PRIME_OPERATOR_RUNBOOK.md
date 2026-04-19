# Prime Operator Runbook

Phase-based checklist for AGIJobDiscoveryPrime operation.

## Scope
- Runtime: `agent/prime-*`
- Procurement state/artifacts: `agent/artifacts/proc_<id>/`
- Signing toolchain: MetaMask + Ledger

## Phase review model

### 1) Inspection / fit decision
Review:
- `inspection/*` bundle
- `fit_evaluation` output and deadline context
Decision:
- proceed (`FIT_APPROVED`) or stop (`NOT_A_FIT`)

### 2) Commit-ready
Required package:
- application artifacts + commitment material
- `unsigned_commit_tx.json`
- review checklist / decoded call
Operator action:
- sign+broadcast commit tx
- record tx hash/state update

### 3) Reveal-ready
Required package:
- reveal payload + commitment verification
- `unsigned_reveal_tx.json`
Operator action:
- sign+broadcast reveal tx
- record tx hash/state update

### 4) Finalist accept (if shortlisted)
Required package:
- finalist eligibility evidence
- `unsigned_accept_finalist_tx.json`
Operator action:
- sign+broadcast finalist acceptance

### 5) Trial submit
Required package:
- trial artifact manifest
- publish + fetch-back verification
- `unsigned_submit_trial_tx.json`
Operator action:
- sign+broadcast trial submission

### 6) Completion (if selected)
Required package:
- linked job completion artifact set
- `unsigned_request_completion_tx.json`
Operator action:
- sign+broadcast completion request

## Always verify before signature
- chainId and contract address
- decoded function + args
- artifact bindings and preconditions
- deadline window is currently valid

## Never do
- never sign without decoded-call verification,
- never sign when artifact bundle is incomplete,
- never assume runtime has broadcast anything.

Related docs:
- [PRIME_ARCHITECTURE.md](./PRIME_ARCHITECTURE.md)
- [PRIME_UNSIGNED_TX_SPEC.md](./PRIME_UNSIGNED_TX_SPEC.md)
- [METAMASK_LEDGER_SIGNING_GUIDE.md](./METAMASK_LEDGER_SIGNING_GUIDE.md)
