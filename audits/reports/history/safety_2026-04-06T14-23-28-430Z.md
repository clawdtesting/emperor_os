# safety Audit Report

🚨 **Status: CRITICAL**

| Metric | Value |
|---|---|
| Started | 2026-04-06T14:23:28.428Z |
| Completed | 2026-04-06T14:23:28.428Z |
| Duration | 0ms |
| Pass | 4 |
| Warn | 1 |
| Fail | 0 |
| Critical | 1 |

## Checks

### 🚨 safety.no_private_key_usage — critical

1 private key reference(s) found: PRIVATE_KEY @ /home/emperor/.openclaw/workspace/agent/prime/prime-evaluate.js:25
_Duration: 342ms_

### ✅ safety.no_signer_send_transaction — pass

No signer/wallet sendTransaction calls detected
_Duration: 190ms_

### ✅ safety.unsigned_only_guarantee — pass

No artifact files found — unsigned-only guarantee holds by absence

### ✅ safety.anti_replay_freshness — pass

No artifacts to check — freshness requirement satisfied by absence

### ⚠️ safety.pre_sign_simulation_policy — warn

No simulation call detected in agent/core source — pre-sign simulation policy may not be enforced
_Duration: 2.3s_

### ✅ safety.signing_manifest_integrity — pass

No signing manifests found — integrity requirement satisfied by absence
