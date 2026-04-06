# Prime Phase Model — Emperor_OS
_Reference: `.openclaw/workspace/agent/prime-phase-model.js`_

---

## Overview

Prime (AGIJobDiscoveryPrime) is a procurement/discovery layer that sits **upstream** of
AGIJobManager assignment. It uses a commit-reveal scheme with multi-phase deadlines.

A procurement goes through these on-chain phases, determined purely by comparing the
current block timestamp against deadline values in the procurement struct.

---

## On-Chain Phase Derivation

```
now < commitDeadline         → COMMIT_OPEN
now < revealDeadline         → REVEAL_OPEN
now < finalistAcceptDeadline → FINALIST_ACCEPT
now < trialDeadline          → TRIAL_OPEN
now < scoreCommitDeadline    → SCORE_COMMIT
now < scoreRevealDeadline    → SCORE_REVEAL
else                         → CLOSED
```

Source: `deriveChainPhase(procStruct, nowSecs)` in `prime-phase-model.js`

---

## Contract: AGIJobDiscoveryPrime

Address: `0xd5EF1dde7Ac60488f697ff2A7967a52172A78F29`  
Chain: Ethereum Mainnet (chainId 1)

### Procurement Struct (from `procurements(uint256 id)`)
| Field | Type | Description |
|---|---|---|
| jobId | uint256 | Linked AGIJobManager job |
| employer | address | Procurement creator |
| commitDeadline | uint256 | Unix timestamp — commit window closes |
| revealDeadline | uint256 | Unix timestamp — reveal window closes |
| finalistAcceptDeadline | uint256 | Unix timestamp — finalist accept window closes |
| trialDeadline | uint256 | Unix timestamp — trial submission window closes |
| scoreCommitDeadline | uint256 | Unix timestamp — validator score commit closes |
| scoreRevealDeadline | uint256 | Unix timestamp — validator score reveal closes |

### Application View (from `applicationView(uint256 id, address agent)`)
| Field | Type | Description |
|---|---|---|
| phase | uint8 | 0=None, 1=Committed, 2=Revealed, 3=Shortlisted, 4=TrialSubmitted |
| applicationURI | string | IPFS URI of revealed application |
| commitment | bytes32 | Stored commitment hash |
| shortlisted | bool | Whether this agent is shortlisted |

---

## Local Status Machine (Emperor_OS internal)

These are the values stored in `proc_<id>/state.json`.

### Discovery / Inspection
| Status | Meaning |
|---|---|
| `DISCOVERED` | Procurement found via ProcurementCreated event. Not yet inspected. |
| `INSPECTED` | Inspection bundle written. Awaiting operator fit decision. |
| `NOT_A_FIT` | **Terminal.** Operator or evaluator rejected — skip. |
| `FIT_APPROVED` | Operator approved. Proceed to application. |

### Application (Commit Phase)
| Status | Meaning |
|---|---|
| `APPLICATION_DRAFTED` | Markdown written, pinned to IPFS. Commitment computed. |
| `COMMIT_READY` | Unsigned commitApplication tx built. Awaiting operator signature. |
| `COMMIT_SUBMITTED` | Operator broadcast commit tx. Waiting for reveal window. |

### Reveal Phase
| Status | Meaning |
|---|---|
| `REVEAL_READY` | Reveal window open. Unsigned revealApplication tx built. |
| `REVEAL_SUBMITTED` | Operator broadcast reveal tx. Waiting for shortlist. |

### Shortlist / Finalist
| Status | Meaning |
|---|---|
| `SHORTLISTED` | ShortlistFinalized event confirmed our address. |
| `NOT_SHORTLISTED` | **Terminal.** Not on shortlist. |
| `FINALIST_ACCEPT_READY` | Unsigned acceptFinalist tx built. Awaiting operator signature. |
| `FINALIST_ACCEPT_SUBMITTED` | Operator broadcast accept tx. Waiting for trial window. |

### Trial Phase
| Status | Meaning |
|---|---|
| `TRIAL_IN_PROGRESS` | Trial execution underway. |
| `TRIAL_READY` | Trial artifact + IPFS verified. Unsigned submitTrial tx built. |
| `TRIAL_SUBMITTED` | Operator broadcast trial tx. Waiting for scoring. |

### Scoring & Selection
| Status | Meaning |
|---|---|
| `WAITING_SCORE_PHASE` | Validators scoring. No action. |
| `WINNER_PENDING` | Scoring complete. Awaiting winner designation. |
| `SELECTED` | We are selected as winner. Begin linked job execution. |
| `SELECTION_EXPIRED` | Selection window expired. Check fallback. |
| `FALLBACK_PROMOTABLE` | Fallback promotion may be available. |
| `REJECTED` | **Terminal.** Not selected as winner. |

### Job Execution (after selection)
| Status | Meaning |
|---|---|
| `JOB_EXECUTION_IN_PROGRESS` | Executing linked AGIJobManager job. |
| `COMPLETION_READY` | Job complete. Unsigned requestJobCompletion tx built. |
| `COMPLETION_SUBMITTED` | Operator broadcast completion tx. Awaiting settlement. |
| `DONE` | **Terminal.** Fully settled. |

### Other Terminal
| Status | Meaning |
|---|---|
| `EXPIRED` | A deadline passed before we could act. |

---

## Valid Transitions

```
DISCOVERED → INSPECTED | EXPIRED
INSPECTED → NOT_A_FIT | FIT_APPROVED
FIT_APPROVED → APPLICATION_DRAFTED
APPLICATION_DRAFTED → COMMIT_READY
COMMIT_READY → COMMIT_SUBMITTED | EXPIRED
COMMIT_SUBMITTED → REVEAL_READY | EXPIRED
REVEAL_READY → REVEAL_SUBMITTED | EXPIRED
REVEAL_SUBMITTED → SHORTLISTED | NOT_SHORTLISTED | EXPIRED
SHORTLISTED → FINALIST_ACCEPT_READY | EXPIRED
FINALIST_ACCEPT_READY → FINALIST_ACCEPT_SUBMITTED | EXPIRED
FINALIST_ACCEPT_SUBMITTED → TRIAL_IN_PROGRESS | EXPIRED
TRIAL_IN_PROGRESS → TRIAL_READY | EXPIRED
TRIAL_READY → TRIAL_SUBMITTED | EXPIRED
TRIAL_SUBMITTED → WAITING_SCORE_PHASE | EXPIRED
WAITING_SCORE_PHASE → WINNER_PENDING | REJECTED | EXPIRED
WINNER_PENDING → SELECTED | SELECTION_EXPIRED
SELECTION_EXPIRED → FALLBACK_PROMOTABLE | EXPIRED
FALLBACK_PROMOTABLE → SELECTED | EXPIRED
SELECTED → JOB_EXECUTION_IN_PROGRESS
JOB_EXECUTION_IN_PROGRESS → COMPLETION_READY
COMPLETION_READY → COMPLETION_SUBMITTED
COMPLETION_SUBMITTED → DONE
```

Invalid transitions throw an error. No silent status skips.

---

## Commitment Scheme

```
commitment = keccak256(abi.encodePacked(
  uint256 procurementId,
  address agentAddress,
  string  applicationURI,
  bytes32 salt
))
```

- Salt is random 32 bytes. Generated with `prime-client.generateSalt()`.
- Salt is stored in `application/commitment_material.json`. **Keep private until reveal.**
- At reveal: re-compute commitment from stored material. Assert matches on-chain.

---

## Urgency Thresholds

| Level | Threshold |
|---|---|
| Urgent | < 4 hours to deadline |
| Warning | < 24 hours to deadline |
| Critical | < 1 hour to deadline |

These are emitted by the Prime monitor loop.
