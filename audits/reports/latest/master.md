# Master Audit Report

⚠️ **Status: WARN**

| Metric | Value |
|---|---|
| Started | 2026-04-06T20:56:17.932Z |
| Completed | 2026-04-06T20:56:19.797Z |
| Duration | 0ms |
| Pass | 23 |
| Warn | 4 |
| Fail | 0 |
| Critical | 0 |

## Audit Family Breakdown

| Audit | Status | Duration | Pass | Warn | Fail | Critical |
|---|---|---|---|---|---|---|
| static | ✅ pass | 0ms | 9 | 0 | 0 | 0 |
| safety | ⚠️ warn | 0ms | 5 | 1 | 0 | 0 |
| protocol | ⚠️ warn | 0ms | 6 | 1 | 0 | 0 |
| doctrine | ⚠️ warn | 0ms | 3 | 2 | 0 | 0 |

## Checks

### ✅ workspace_boundary — pass

No workspace boundary violations detected
_Duration: 138ms_

### ✅ forbidden_signing_calls — pass

No forbidden signing patterns found in worker code
_Duration: 329ms_

### ✅ forbidden_broadcast_calls — pass

No forbidden broadcast patterns found in worker code
_Duration: 100ms_

### ✅ env_contracts — pass

All environment contract addresses match canonical values

### ✅ required_files — pass

All required files present
_Duration: 1ms_

### ✅ config_env_required — pass

All required environment variables present

### ✅ config_file_exists — pass

agent/config.js exists

### ✅ unsigned_handoff_only — pass

No signing logic found in worker code — unsigned handoff doctrine upheld
_Duration: 26ms_

### ✅ no_private_key_usage — pass

No private key references found in worker code
_Duration: 53ms_

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

### ✅ protocol.chainid_validation — pass

Chain ID 1 is valid

### ✅ protocol.contract_address_validation — pass

All 3 contract addresses are valid and checksummed
_Duration: 2ms_

### ✅ protocol.function_selector_validation — pass

All 2 function selectors match canonical values: submitCompletion(uint256,string,bytes32)=0x5635b65d, approve(address,uint256)=0x095ea7b3
_Duration: 3ms_

### ✅ protocol.calldata_encoding — pass

ABI encoding verified for submitCompletion — selector=0x5635b65d
_Duration: 1ms_

### ✅ protocol.calldata_decoding — pass

ABI decoding utilities verified for AGI contract signatures

### ✅ protocol.erc20_approval_flow — pass

ERC20 approve calldata encodes correctly — selector=0x095ea7b3, spender=0xB3AAeb69b630f0299791679c063d68d6687481d1

### ⚠️ protocol.prime_deadline_logic — warn

No deadline-related code found in agent/core — PRIME deadline logic may be missing
_Duration: 358ms_

### ⚠️ doctrine.max_one_llm_call_per_job — warn

LLM audit log not found — cannot verify call budget

### ⚠️ doctrine.no_llm_before_assignment — warn

LLM audit log not found — cannot verify pre-assignment calls

### ✅ doctrine.unsigned_handoff_only — pass

All 0 tx package(s) are unsigned — handoff boundary intact
_Duration: 1ms_

### ✅ doctrine.deterministic_scoring_required — pass

No nondeterministic constructs detected in agent/core source
_Duration: 79ms_

### ✅ doctrine.workspace_scope_only — pass

No out-of-scope path references detected — workspace boundary intact
_Duration: 183ms_
