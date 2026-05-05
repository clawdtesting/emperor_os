# Emperor OS Prime Readiness

## Overview

AGIJobManagerPrime (Prime) is a dual-contract system designed for decentralized job procurement and execution, separating concerns between job discovery/application (Discovery contract) and fund management/workflow execution (Manager contract).

This document outlines the readiness of Emperor OS to support Prime protocol flows, including current capabilities, gaps, and safety considerations.

---

## Prime Protocol Role Overview

### Contracts

1. **Discovery Contract** (`0xd5EF1dde7Ac60488f697ff2A7967a52172A78F29`)
   - Handles job discovery, application commitment, and revelation.
   - Functions: `commitApplication`, `revealApplication`, `acceptFinalist`, `submitTrial`, `procurements` (view), `applicationView` (view)
   - Events: `ProcurementCreated`, `ShortlistFinalized`

2. **Manager Contract** (`0xF8fc6572098DDcAc4560E17cA4A683DF30ea993e`)
   - Manages funds, validates completion, and settles rewards.
   - (ABI not available locally; treated as unverified)

### Roles

- **Employer**: Creates procurement, funds awards.
- **Agent**: Discovers jobs, applies (commit/reveal), becomes finalist, submits trial, executes work.
- **Validator**: Scores validation reports, recommends actions.
- **Emperor OS**: Facilitates discovery, execution, validation, and preparation of unsigned transaction packages for external signing.

---

## Flow Separation in Emperor OS

To maintain clear boundaries and safety, Emperor OS separates concerns as follows:

### 1. AGIJobManager v1/v2 Executor Flow
   - Job discovery → application → execution → completion → validation → IPFS publish → completion package.
   - Handled by existing v1/v2 job lifecycle.

### 2. AGIJobManager v1/v2 Validator Flow
   - Independent validation of completion packages.
   - Production of validator action packages (unsigned) for external signing.

### 3. Prime Discovery/Procurement Flow
   - Monitoring Discovery contract for new procurements.
   - Supporting commit/reveal applications (unsigned tx prep).
   - Tracking application phases via view functions.

### 4. Prime Finalist/Trial Flow
   - Supporting finalist acceptance and trial submission (unsigned tx prep).
   - Monitoring trial deadlines and outcomes.

### 5. Prime Validator Scoring Flow
   - Supporting validator scoring functions on Prime (if applicable).
   - Note: Prime may have its own validation scoring mechanism separate from v1/v2.

### 6. Prime Settlement Flow
   - Supporting settlement and fund withdrawal (unsigned tx prep).
   - Ensuring funds are correctly allocated post-trial.

---

## Current Emperor OS Support Status

### ✅ Implemented Foundation
- Protocol registry updated to distinguish Prime discovery and manager contracts.
- Discovery ABI loaded locally (`AGIJobDiscoveryPrime.json`).
- Prime-related agent files present (approximately 20 files covering monitoring, inspection, tx building, etc.).
- Ability to read view functions from Discovery contract (e.g., `procurements`, `applicationView`).
- Safety checks in place for transaction building (no private keys, no signing).

### ❌ Missing / To Be Implemented
- Prime-specific job discovery flow (commit/reveal applications).
- Prime finalist acceptance and trial submission.
- Prime validator scoring and reward distribution (if separate from v1/v2).
- Prime settlement and fund allocation.
- Integration of Prime flows into Emperor OS state machine (new job states).
- Unsigned transaction packaging for Prime write actions.
- Validator action packages for Prime scoring/settlement.
- End-to-end tests for Prime flows.

---

## Prime Readiness Assessment

### Architecture Readiness: ✅ READY
- Prime protocol separation implemented in registry
- Discovery contract address configured
- Manager contract address configured

### Read-Only Readiness: ⚠️ PARTIAL
- Discovery ABI available and loaded
- Can call view functions: procurements, applicationView
- Discovery ABI status: partial (functions listed but not fully verified for all signatures)

### Unsigned Write Package Readiness: ❌ NOT READY
- Manager ABI unavailable - cannot verify write function signatures
- No Prime transaction package builders implemented
- Commit/reveal/finalist/trial/validator/settlement flows not implemented

### Live Execution Readiness: ❌ NOT READY
- No Prime state machine integration
- No Prime job discovery monitoring
- No end-to-end Prime flow testing

---

## Safety Doctrine

All irreversible actions (write transactions) must require external human signing. Emperor OS will:
- Never store or use private keys.
- Only generate unsigned transaction JSON packages.
- Require human review before signing any transaction.
- Clearly mark transactions as requiring external wallet signing.
- Separate read-only (view/pure) functions from write operations in user interfaces and automation.

---

## Prime State Model Proposal

The following job states are proposed for Prime support (to be added to the state machine):

- `prime_discovered`: New procurement found via Discovery contract.
- `prime_review_pending`: Procurement reviewed by operator (fit evaluation).
- `prime_commit_package_ready`: Commitment transaction package built (unsigned).
- `prime_reveal_package_ready`: Revelation transaction package built (unsigned).
- `prime_trial_ready`: Finalist accepted, ready to submit trial.
- `prime_trial_deliverable_ready`: Trial deliverables generated.
- `prime_validator_review_ready`: Validation report ready for scoring.
- `prime_validator_action_package_ready`: Validator scoring transaction package built (unsigned).
- `prime_settlement_package_ready`: Settlement transaction package built (unsigned).

All transitions to/from write-action states (commit, reveal, accept finalist, submit trial, score, settle) must require explicit operator approval and external signing.

---

## Next Implementation Stages

1. **Prime Discovery Monitoring**: Extend job discovery to scan Prime contract.
2. **Commit/Reveal Flow**: Build unsigned transaction packages for `commitApplication` and `revealApplication`.
3. **Finalist/Trial Flow**: Support `acceptFinalist` and `submitTrial` transaction packaging.
4. **Prime Validation Scoring**: If Prime includes scoring, build packages for scoring functions.
5. **Settlement Flow**: Build packages for fund withdrawal/settlement.
6. **State Machine Integration**: Add Prime states and transitions.
7. **Validator Action Packages for Prime**: Create validator review and action packets specific to Prime.
8. **Testing & Validation**: End-to-end test nets and audit scripts.

---

## Conclusion

Emperor OS has laid the foundation for Prime support by separating protocol concerns, loading the Discovery ABI, and providing a scaffold of agent files. However, significant implementation work remains before Prime flows can be executed. The current readiness assessment shows:

- Architecture: READY
- Read-only: PARTIAL
- Unsigned write packages: NOT READY
- Live execution: NOT READY

The next steps involve implementing the actual flows, ensuring safety, and integrating with the state manager.