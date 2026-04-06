# doctrine Audit Report

⚠️ **Status: WARN**

| Metric | Value |
|---|---|
| Started | 2026-04-06T21:38:01.362Z |
| Completed | 2026-04-06T21:38:01.362Z |
| Duration | 0ms |
| Pass | 3 |
| Warn | 2 |
| Fail | 0 |
| Critical | 0 |

## Checks

### ⚠️ doctrine.max_one_llm_call_per_job — warn

LLM audit log not found — cannot verify call budget

### ⚠️ doctrine.no_llm_before_assignment — warn

LLM audit log not found — cannot verify pre-assignment calls

### ✅ doctrine.unsigned_handoff_only — pass

All 0 tx package(s) are unsigned — handoff boundary intact
_Duration: 1ms_

### ✅ doctrine.deterministic_scoring_required — pass

No nondeterministic constructs detected in agent/core source
_Duration: 78ms_

### ✅ doctrine.workspace_scope_only — pass

No out-of-scope path references detected — workspace boundary intact
_Duration: 181ms_
