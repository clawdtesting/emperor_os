# Master Audit Report

🚨 **Status: CRITICAL**

| Metric | Value |
|---|---|
| Started | 2026-04-06T14:23:23.491Z |
| Completed | 2026-04-06T14:23:35.655Z |
| Duration | 0ms |
| Pass | 14 |
| Warn | 5 |
| Fail | 2 |
| Critical | 6 |

## Audit Family Breakdown

| Audit | Status | Duration | Pass | Warn | Fail | Critical |
|---|---|---|---|---|---|---|
| static | 🚨 critical | 0ms | 6 | 0 | 0 | 3 |
| safety | 🚨 critical | 0ms | 4 | 1 | 0 | 1 |
| protocol | ❌ fail | 0ms | 3 | 2 | 2 | 0 |
| doctrine | 🚨 critical | 0ms | 1 | 2 | 0 | 2 |

## Checks

### 🚨 workspace_boundary — critical

Found 41 potential path escape patterns in agent/core code
_Duration: 1.0s_

### ✅ forbidden_signing_calls — pass

No forbidden signing patterns found in worker code
_Duration: 502ms_

### ✅ forbidden_broadcast_calls — pass

No forbidden broadcast patterns found in worker code
_Duration: 155ms_

### ✅ env_contracts — pass

All environment contract addresses match canonical values

### ✅ required_files — pass

All required files present
_Duration: 1ms_

### ✅ config_env_required — pass

All required environment variables present

### ✅ config_file_exists — pass

agent/config.js exists

### 🚨 unsigned_handoff_only — critical

Found 302 potential signing reference(s) violating unsigned-only doctrine
_Duration: 196ms_

### 🚨 no_private_key_usage — critical

Found 187 potential private key reference(s)
_Duration: 430ms_

### 🚨 safety.no_private_key_usage — critical

1 private key reference(s) found: PRIVATE_KEY @ /home/emperor/.openclaw/workspace/agent/prime/prime-evaluate.js:25
_Duration: 336ms_

### ✅ safety.no_signer_send_transaction — pass

No signer/wallet sendTransaction calls detected
_Duration: 191ms_

### ✅ safety.unsigned_only_guarantee — pass

No artifact files found — unsigned-only guarantee holds by absence
_Duration: 1ms_

### ✅ safety.anti_replay_freshness — pass

No artifacts to check — freshness requirement satisfied by absence

### ⚠️ safety.pre_sign_simulation_policy — warn

No simulation call detected in agent/core source — pre-sign simulation policy may not be enforced
_Duration: 2.3s_

### ✅ safety.signing_manifest_integrity — pass

No signing manifests found — integrity requirement satisfied by absence

### ⚠️ protocol.chainid_validation — warn

EXPECTED_CHAIN_ID not set — chain ID validation skipped

### ✅ protocol.contract_address_validation — pass

All 3 contract addresses are valid and checksummed
_Duration: 1ms_

### ❌ protocol.function_selector_validation — fail

submitCompletion(uint256,string,bytes32): expected 0xd9d98ce4, got 0x5635b65d
_Duration: 3ms_

### ❌ protocol.calldata_encoding — fail

submitCompletion selector mismatch: expected 0xd9d98ce4, got 0x5635b65d
_Duration: 1ms_

### ✅ protocol.calldata_decoding — pass

ABI decoding utilities verified for AGI contract signatures
_Duration: 1ms_

### ✅ protocol.erc20_approval_flow — pass

ERC20 approve calldata encodes correctly — selector=0x095ea7b3, spender=0xB3AAeb69b630f0299791679c063d68d6687481d1

### ⚠️ protocol.prime_deadline_logic — warn

No deadline-related code found in agent/core — PRIME deadline logic may be missing
_Duration: 3.0s_

### ⚠️ doctrine.max_one_llm_call_per_job — warn

LLM audit log not found — cannot verify call budget

### ⚠️ doctrine.no_llm_before_assignment — warn

LLM audit log not found — cannot verify pre-assignment calls

### ✅ doctrine.unsigned_handoff_only — pass

All 0 tx package(s) are unsigned — handoff boundary intact

### 🚨 doctrine.deterministic_scoring_required — critical

39 nondeterministic construct(s) found in scoring paths: /home/emperor/.openclaw/workspace/agent/artifact-manager.js:46 — const tmp = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;; /home/emperor/.openclaw/workspace/agent/artifact-manager.js:52 — const tmp = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;; /home/emperor/.openclaw/workspace/agent/prime-artifact-builder.js:21 — const tmp = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
_Duration: 1.2s_

### 🚨 doctrine.workspace_scope_only — critical

15 out-of-scope path reference(s) detected: /home/emperor/.openclaw/workspace/core/config.js:5 — "/home/ubuntu/emperor_OS/.openclaw/workspace",; /home/emperor/.openclaw/workspace/core/node_modules/@types/node/path.d.ts:29 — * The full directory path such as '/home/user/dir' or 'c:\path\dir'; /home/emperor/.openclaw/workspace/core/node_modules/@types/node/path.d.ts:51 — * The full directory path such as '/home/user/dir' or 'c:\path\dir'
_Duration: 2.9s_
