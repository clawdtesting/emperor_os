# AGIJob Operator Runbook

Operational runbook for AGIJobManager-style flows in this repository.

## Scope
- Runtime modules: `agent/`, `agent/Job-v1/`, `agent/Job-v2/`
- State: `agent/state/jobs/*.json`
- Artifacts: `artifacts/job_<id>/` (and related outputs)
- Optional operator dashboard: `mission-control/`

## Operator flow
1. **Review discovered/evaluated job state**
   - Confirm job identity, lane/version, and current status.
2. **Review unsigned apply package**
   - Confirm correct contract, function, args, and lane mapping.
3. **Sign + broadcast externally (MetaMask + Ledger)**
   - Record tx hash back into local state.
4. **After assignment, review execution artifacts**
   - Deliverable quality, validation output, publish/fetch-back verification.
5. **Review unsigned completion package**
   - Confirm completion URI and linked job ID are correct.
6. **Sign + broadcast completion externally**
   - Record tx hash and settlement progress in state.

## Artifacts that matter before completion signing
- Deliverable artifact (e.g., `deliverable.md` or lane equivalent)
- Validation report
- Publish manifest / URI record
- Fetch-back verification evidence
- Unsigned completion tx package + review checklist

## What is signed vs never auto-sent
- **Signed by operator:** apply and completion transactions.
- **Never auto-sent by runtime:** all on-chain write transactions.

## Mission Control vs local artifacts
- Mission Control is an operator surface for inspection and packaging workflows.
- Local `agent/state/*` + artifact folders remain the durable record for recovery/audit.
- If Mission Control view and local artifacts disagree, treat local persisted state/artifacts as the source to reconcile first.

## Stop conditions
Do not sign if:
- decoded call does not match reviewed intent,
- artifact set is incomplete,
- state says READY but required files/checks are missing,
- chain ID / contract target mismatch is present.

Related docs:
- [OPERATOR_INSTRUCTIONS.md](./OPERATOR_INSTRUCTIONS.md)
- [METAMASK_LEDGER_SIGNING_GUIDE.md](./METAMASK_LEDGER_SIGNING_GUIDE.md)
- [CURRENT_SYSTEM.md](./CURRENT_SYSTEM.md)
