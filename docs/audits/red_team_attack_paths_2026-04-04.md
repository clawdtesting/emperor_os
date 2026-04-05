# Red-Team Attack Paths — Emperor_OS

Date: 2026-04-04

## Scope
- Job state system (`agent/state.js`, `agent/*.js` pipeline)
- Prime procurement state and action system (`agent/prime-*.js`)
- Artifact generation and review-gate checks
- Unsigned transaction packaging and pre-sign validation
- Monitor/orchestrator loop and recovery behavior

## Top 10 exploitable vulnerabilities

1. **Direct state patch bypasses transition validation (critical)**
   - `setProcState()` explicitly applies arbitrary patch and "Does NOT validate transitions".
   - Any code path or file write with access to this API can force impossible statuses.

2. **State-machine bypass via raw state file edit (critical)**
   - `state.json` is treated as source of truth without integrity/authentication.
   - Manual or compromised process edits can jump to READY/SUBMITTED states.

3. **Atomic write collision (`.tmp`) enables race corruption (critical)**
   - `writeJson()` in job/prime state uses constant `<path>.tmp` temp filename.
   - Concurrent writes to same file can clobber temp content and produce lost updates.

4. **Commit gate accepts failed fit decisions (critical)**
   - Commit gate only checks `fit_evaluation.decision` exists (truthy), not that decision is PASS.
   - Tampered `decision: "FAIL"` still satisfies gate and allows commit package generation.

5. **Reveal gate accepts string truthy for verification (high)**
   - `requireJsonField` checks only non-falsy values.
   - `verificationPassed: "true"` passes gate despite not being boolean true.

6. **Monitor can mark MISSED_WINDOW incorrectly due to stale local status (high)**
   - `refreshActiveProcurements()` computes next action from stale `state` snapshot and writes status directly via `setProcState()`.
   - No compare-and-swap/version check; parallel orchestrator updates can be overwritten.

7. **Job state pruning deletes active forensic history (high)**
   - `pruneStateFiles()` may remove terminal job states based on TTL/max file policy.
   - Deletes only state JSON, not artifacts, causing state/artifact desync and irreproducibility.

8. **Unsigned tx package trusts MCP-prepared tx target before validator stage (high)**
   - `buildUnsignedTxPackage()` copies `preparedTx.to/data/value` directly.
   - If operator signs wrong package before/without full check discipline, wrong contract call can be broadcast.

9. **LLM call budget can be reset by state tamper (medium-high)**
   - One-call policy tracked by mutable `state.llmCallsUsed` in plaintext JSON.
   - Reset to 0 and redraft repeatedly; increases prompt-injection attack surface.

10. **Monitor error handling swallows failures and continues loop (medium)**
   - Monitor cycle catches and logs errors but does not raise persistent failure state.
   - Repeated failures can become silent operational stall with stale next_action snapshots.

## Exploit scenarios

### 1) Impossible transition injection
- Entry: `agent/prime-state.js:setProcState()` or direct write to `artifacts/proc_<id>/state.json`.
- Steps:
  1. Modify state to `COMPLETION_READY` while chain/application never reached selection.
  2. Orchestrator reads modified status and proceeds to completion packaging flow.
  3. Artifacts are generated for a phase never legally reached.
- Resulting state: history shows impossible lifecycle; downstream ops act on fabricated phase.
- Severity: **critical**.
- Detectable: **partially** (only if operator inspects full history and chain snapshot).

### 2) Commit despite failed fit
- Entry: `inspection/fit_evaluation.json` + `assertCommitGate()`.
- Steps:
  1. Set `fit_evaluation.decision = "FAIL"` (or any truthy string).
  2. Keep required files present.
  3. Build commit tx package; gate passes because only truthiness is checked.
- Resulting state: system can advance with known-unfit procurement.
- Severity: **critical**.
- Detectable: **low** (looks formally valid unless decision semantics are reviewed).

### 3) Reveal with fake verification
- Entry: `reveal/commitment_verification.json` + `assertRevealGate()`.
- Steps:
  1. Write `verificationPassed: "true"` string, not boolean.
  2. Gate only checks field presence/falsy and passes.
  3. Generate reveal tx with untrusted commitment relation.
- Resulting state: valid-looking reveal package may reference broken commitment linkage.
- Severity: **high**.
- Detectable: **medium** (hidden unless strict type check is manually done).

### 4) Tmp-file race corruption
- Entry: any concurrent writers calling `writeJson(filePath, data)` on same target.
- Steps:
  1. Trigger monitor + orchestrator or parallel workers writing same state/checkpoint file.
  2. Both write to `<file>.tmp` and rename.
  3. Last rename wins; one update silently lost.
- Resulting state: missing history entries, stale timestamps, skipped decisions.
- Severity: **critical**.
- Detectable: **low** (no explicit error required).

### 5) State/artifact desync via prune
- Entry: `pruneStateFiles()` in `agent/state.js`.
- Steps:
  1. Configure low `MAX_STATE_FILES` or short TTL.
  2. Run prune; terminal states deleted.
  3. Artifact dirs remain; no state index for correlation/recovery.
- Resulting state: orphaned artifacts, replay confusion, non-reproducible audit trail.
- Severity: **high**.
- Detectable: **medium** (noticed only during recovery/audit).

### 6) Wrong-target chain interaction through preparedTx poisoning
- Entry: MCP response consumed by `requestJobCompletion()` → `buildUnsignedTxPackage()`.
- Steps:
  1. Compromise/impersonate MCP endpoint.
  2. Return crafted `preparedTx` with malicious `to` and selector.
  3. Package is generated; if review checks are bypassed operationally, operator may sign.
- Resulting state: irreversible on-chain call to wrong contract.
- Severity: **critical**.
- Detectable: **high if pre-sign validator enforced**, **low if human flow bypasses it**.

### 7) Duplicate execution via loop overlap
- Entry: orchestrator/monitor scheduling and no per-procurement lock.
- Steps:
  1. Start multiple orchestrator instances or overlapping cycles.
  2. Same procurement action executes twice before status write settles.
  3. Duplicate artifact writes and competing state transitions occur.
- Resulting state: duplicate tx package generations, inconsistent `statusHistory`.
- Severity: **high**.
- Detectable: **medium**.

### 8) LLM-boundary policy bypass by state tamper
- Entry: `state.json` `llmCallsUsed`.
- Steps:
  1. Reset `llmCallsUsed` to 0.
  2. Force repeated `draftWithLLM` invocations with attacker-controlled retrieval/context.
  3. Iterate until malformed but plausible artifact produced.
- Resulting state: multiple LLM calls contrary to policy, increased hallucination/prompt-injection risk.
- Severity: **medium-high**.
- Detectable: **low** unless state diffs are audited.

### 9) Silent monitor failure loop
- Entry: `startPrimeMonitor()` cycle catch block.
- Steps:
  1. Cause recurring RPC error/parsing exception.
  2. Cycle logs error and continues without elevating state/alarm.
  3. `next_action.json` remains stale while chain advances.
- Resulting state: missed windows with no hard-stop escalation artifact.
- Severity: **medium-high**.
- Detectable: **low** if logs not continuously monitored.

### 10) Recovery rollback ambiguity creates contradictory status
- Entry: `recoverProcurement()` fallback behavior.
- Steps:
  1. Force status mismatch (e.g., local `REVEAL_SUBMITTED`, chain shows none).
  2. Recovery attempts transition; on invalid transition it patches only `recoveryNote`.
  3. Status may remain incorrect while note implies rollback needed.
- Resulting state: contradictory state note vs status; operator may act on wrong phase.
- Severity: **high**.
- Detectable: **medium**.

## Silent failure paths

1. Lost update from `.tmp` race leaves no exception, only overwritten state.
2. Monitor cycle catches error and proceeds; no persistent failure status artifact.
3. Stale `next_action.json` consumed after refresh failure, causing wrong action timing.
4. `setProcState()` direct patch mutates status without `statusHistory` append if caller omits it.
5. Prune removes state files while artifacts persist, silently severing provenance chain.

## Irreversible failure cases

1. Operator signs poisoned unsigned tx package -> wrong contract call on mainnet (irreversible).
2. Commit/reveal mismatch submitted on-chain due to forged verification artifact -> lost procurement path.
3. Finalist accept or trial submission signed with incorrect procurement ID from tampered package -> stake/economic loss.
4. Completion request signed with malicious calldata from compromised MCP response -> incorrect settlement pathway.

## Most dangerous chain-level risk

**Prepared transaction poisoning at MCP boundary leading to operator-signed malicious calldata**.

- Why most dangerous: it converts an off-chain compromise into an irreversible on-chain action with real economic consequence.
- Amplifier: unsigned package builder accepts external `preparedTx` fields; safety depends on strict downstream validation and operator checklist adherence every time.

## Mitigations tied to exploits

1. Enforce transition validation in all status writes (`setProcState` write-path hardening) to block impossible-state injection.
2. Replace single `.tmp` path with unique temp files + fsync/rename guards to prevent concurrent clobber races.
3. Strengthen gate checks to strict typed semantics (`decision === "PASS"`, `verificationPassed === true`, booleans only).
4. Add integrity/authentication envelope for `state.json` + critical artifacts (hash chain or signed manifest) to detect tampering.
5. Add per-procurement lock/lease file to serialize monitor/orchestrator actions.
6. Make monitor failures persistent in state/checkpoint (`monitor_health.json`) with escalating fatal threshold.
7. Make prune state-aware (never delete states without writing archive index + artifact pointer map).
8. Harden tx packaging by asserting `preparedTx.to === expected contract` before package creation, not only in later validator.
9. Make one-LLM-call quota append-only (counter signed in immutable audit log) to prevent reset.
10. In recovery, fail closed on rollback mismatch (explicit `RECOVERY_BLOCKED` status) instead of note-only patch.
