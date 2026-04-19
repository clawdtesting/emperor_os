# MetaMask + Ledger Signing Guide

This guide covers the human signing boundary used by Emperor_OS.

## Boundary reminder
- Runtime builds unsigned JSON packages only.
- Operator signs/broadcasts externally with MetaMask + Ledger.
- No private key should exist in runtime env or repo code paths.

## Pre-sign checklist (every tx)
1. Verify `chainId` and target contract address.
2. Verify `decodedCall` exactly matches intent.
3. Cross-check call arguments against local artifacts/state.
4. Confirm preconditions and review checklist are fully satisfied.
5. Simulate if available in wallet tooling.

## Signing steps
1. Open unsigned tx package + review manifest.
2. Open MetaMask on the correct network.
3. Connect Ledger and confirm account/address.
4. Review calldata/function in wallet UI before confirm.
5. Sign on Ledger device.
6. Broadcast from MetaMask.
7. Record tx hash in the corresponding local state/artifact package.

## Do not sign if
- Contract address is unknown or mismatched.
- Function/args differ from reviewed artifact package.
- Artifact fetch-back or validation checks are failing.
- State is stale or inconsistent with chain reality.

Related docs:
- [PRIME_UNSIGNED_TX_SPEC.md](./PRIME_UNSIGNED_TX_SPEC.md)
- [AGIJOB_OPERATOR_RUNBOOK.md](./AGIJOB_OPERATOR_RUNBOOK.md)
- [PRIME_OPERATOR_RUNBOOK.md](./PRIME_OPERATOR_RUNBOOK.md)
