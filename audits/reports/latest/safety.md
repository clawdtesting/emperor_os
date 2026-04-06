# safety Audit Report

⚠️ **Status: WARN**

| Metric | Value |
|---|---|
| Started | 2026-04-06T20:56:19.077Z |
| Completed | 2026-04-06T20:56:19.077Z |
| Duration | 0ms |
| Pass | 5 |
| Warn | 1 |
| Fail | 0 |
| Critical | 0 |

## Checks

### ✅ safety.no_private_key_usage — pass

No private key usage detected in agent or core source
_Duration: 235ms_

### ✅ safety.no_signer_send_transaction — pass

No signer/wallet sendTransaction calls detected
_Duration: 130ms_

### ✅ safety.unsigned_only_guarantee — pass

No artifact files found — unsigned-only guarantee holds by absence

### ✅ safety.anti_replay_freshness — pass

No artifacts to check — freshness requirement satisfied by absence

### ⚠️ safety.pre_sign_simulation_policy — warn

No simulation call detected in agent/core source — pre-sign simulation policy may not be enforced
_Duration: 145ms_

### ✅ safety.signing_manifest_integrity — pass

No signing manifests found — integrity requirement satisfied by absence
