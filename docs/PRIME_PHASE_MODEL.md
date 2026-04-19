# Prime Phase Model

Reference implementation: `agent/prime-phase-model.js`.

## Chain phase derivation

Derived from procurement deadlines:

- `COMMIT_OPEN`
- `REVEAL_OPEN`
- `FINALIST_ACCEPT`
- `TRIAL_OPEN`
- `SCORE_COMMIT`
- `SCORE_REVEAL`
- `CLOSED`

## Local procurement statuses

Persisted in `agent/artifacts/proc_<id>/state.json`.

Core progression:
`DISCOVERED -> INSPECTED -> FIT_APPROVED -> APPLICATION_DRAFTED -> COMMIT_READY -> COMMIT_SUBMITTED -> REVEAL_READY -> REVEAL_SUBMITTED -> SHORTLISTED -> FINALIST_ACCEPT_READY -> FINALIST_ACCEPT_SUBMITTED -> TRIAL_IN_PROGRESS -> TRIAL_READY -> TRIAL_SUBMITTED -> WAITING_SCORE_PHASE -> WINNER_PENDING -> SELECTED -> JOB_EXECUTION_IN_PROGRESS -> COMPLETION_READY -> COMPLETION_SUBMITTED -> DONE`

Terminal alternatives include `NOT_A_FIT`, `NOT_SHORTLISTED`, `REJECTED`, `EXPIRED`, `MISSED_WINDOW`.

For full validity and transition checks, use `isValidTransition(...)` and related helpers in `agent/prime-phase-model.js`.

## Operator READY boundaries
READY statuses requiring operator signing:
- `COMMIT_READY`
- `REVEAL_READY`
- `FINALIST_ACCEPT_READY`
- `TRIAL_READY`
- `COMPLETION_READY`

At each READY state, required bundle is:
1. phase artifacts,
2. review gate output,
3. unsigned tx package,
4. next action guidance.

See:
- [PRIME_OPERATOR_RUNBOOK.md](./PRIME_OPERATOR_RUNBOOK.md)
- [PRIME_UNSIGNED_TX_SPEC.md](./PRIME_UNSIGNED_TX_SPEC.md)
