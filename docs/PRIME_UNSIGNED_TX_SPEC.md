# Prime Unsigned Transaction Spec

Reference implementation: `agent/prime-tx-builder.js` and `agent/prime-tx-validator.js`.

## Purpose
Define the minimum required shape for Prime transaction handoff packages. Runtime produces; operator signs.

## Required fields
- `schema`
- `chainId`
- `target`
- `contractName`
- `function`
- `args`
- `calldata`
- `decodedCall`
- `generatedAt`
- `phase`
- `procurementId` (and `linkedJobId` where applicable)
- `preconditions`
- `artifactBindings`
- `reviewChecklist`
- `safety` (`noPrivateKeyInRuntime`, `noSigningInRuntime`, `noBroadcastInRuntime`)

## Phase packages
Expected files under `agent/artifacts/proc_<id>/`:
- `application/unsigned_commit_tx.json`
- `reveal/unsigned_reveal_tx.json`
- `finalist/unsigned_accept_finalist_tx.json`
- `trial/unsigned_submit_trial_tx.json`
- `completion/unsigned_request_completion_tx.json`

## Signing policy
A package is not signable unless:
1. `decodedCall` matches operator intent,
2. contract + chain are correct,
3. artifact bindings are present and valid,
4. preconditions/checklist are complete.

Related docs:
- [METAMASK_LEDGER_SIGNING_GUIDE.md](./METAMASK_LEDGER_SIGNING_GUIDE.md)
- [PRIME_OPERATOR_RUNBOOK.md](./PRIME_OPERATOR_RUNBOOK.md)
