# recovery Audit Report

⚠️ **Status: WARN**

| Metric | Value |
|---|---|
| Started | 2026-04-06T21:42:18.191Z |
| Completed | 2026-04-06T21:42:18.191Z |
| Duration | 0ms |
| Pass | 2 |
| Warn | 3 |
| Fail | 0 |
| Critical | 0 |

## Checks

### ⚠️ recovery.singleton_lock_enforcement — warn

No singleton lock mechanism detected in agent/core — concurrent execution may not be prevented
_Duration: 265ms_

### ✅ recovery.crash_mid_execution — pass

No state fixtures present — crash mid-execution not applicable
_Duration: 1ms_

### ⚠️ recovery.duplicate_submission_prevention — warn

No duplicate submission guard detected in source — idempotency may not be enforced
_Duration: 234ms_

### ✅ recovery.partial_state_repair — pass

No state fixtures — partial state repair not applicable

### ⚠️ recovery.restart_resume — warn

No restart/resume logic detected — interrupted jobs may not be recoverable
_Duration: 233ms_
