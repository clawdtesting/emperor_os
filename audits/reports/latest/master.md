# Master Audit Report

⚠️ **Status: WARN**

| Metric | Value |
|---|---|
| Started | 2026-04-06T21:42:16.321Z |
| Completed | 2026-04-06T21:42:20.243Z |
| Duration | 0ms |
| Pass | 50 |
| Warn | 10 |
| Fail | 0 |
| Critical | 0 |

## Audit Family Breakdown

| Audit | Status | Duration | Pass | Warn | Fail | Critical |
|---|---|---|---|---|---|---|
| static | ✅ pass | 0ms | 9 | 0 | 0 | 0 |
| safety | ⚠️ warn | 0ms | 5 | 1 | 0 | 0 |
| protocol | ⚠️ warn | 0ms | 6 | 1 | 0 | 0 |
| functional | ✅ pass | 0ms | 5 | 0 | 0 | 0 |
| recovery | ⚠️ warn | 0ms | 2 | 3 | 0 | 0 |
| artifact | ✅ pass | 0ms | 5 | 0 | 0 | 0 |
| doctrine | ⚠️ warn | 0ms | 3 | 2 | 0 | 0 |
| integration | ⚠️ warn | 0ms | 3 | 2 | 0 | 0 |
| determinism | ✅ pass | 0ms | 4 | 0 | 0 | 0 |
| performance | ⚠️ warn | 0ms | 4 | 1 | 0 | 0 |
| economics | ✅ pass | 0ms | 4 | 0 | 0 | 0 |

## Checks

### ✅ workspace_boundary — pass

No workspace boundary violations detected
_Duration: 142ms_

### ✅ forbidden_signing_calls — pass

No forbidden signing patterns found in worker code
_Duration: -158ms_

### ✅ forbidden_broadcast_calls — pass

No forbidden broadcast patterns found in worker code
_Duration: 106ms_

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
_Duration: 54ms_

### ✅ safety.no_private_key_usage — pass

No private key usage detected in agent or core source
_Duration: 241ms_

### ✅ safety.no_signer_send_transaction — pass

No signer/wallet sendTransaction calls detected
_Duration: 133ms_

### ✅ safety.unsigned_only_guarantee — pass

No artifact files found — unsigned-only guarantee holds by absence
_Duration: 1ms_

### ✅ safety.anti_replay_freshness — pass

No artifacts to check — freshness requirement satisfied by absence

### ⚠️ safety.pre_sign_simulation_policy — warn

No simulation call detected in agent/core source — pre-sign simulation policy may not be enforced
_Duration: 142ms_

### ✅ safety.signing_manifest_integrity — pass

No signing manifests found — integrity requirement satisfied by absence

### ✅ protocol.chainid_validation — pass

Chain ID 1 is valid

### ✅ protocol.contract_address_validation — pass

All 3 contract addresses are valid and checksummed
_Duration: 1ms_

### ✅ protocol.function_selector_validation — pass

All 2 function selectors match canonical values: submitCompletion(uint256,string,bytes32)=0x5635b65d, approve(address,uint256)=0x095ea7b3
_Duration: 3ms_

### ✅ protocol.calldata_encoding — pass

ABI encoding verified for submitCompletion — selector=0x5635b65d

### ✅ protocol.calldata_decoding — pass

ABI decoding utilities verified for AGI contract signatures
_Duration: 1ms_

### ✅ protocol.erc20_approval_flow — pass

ERC20 approve calldata encodes correctly — selector=0x095ea7b3, spender=0xB3AAeb69b630f0299791679c063d68d6687481d1

### ⚠️ protocol.prime_deadline_logic — warn

No deadline-related code found in agent/core — PRIME deadline logic may be missing
_Duration: 362ms_

### ✅ functional.agijobmanager_e2e_mock — pass

AGIJobManager e2e mock passed all 5 pipeline stages
_Duration: 1ms_

### ✅ functional.prime_e2e_mock — pass

Prime e2e mock passed all 9 phase(s)

### ✅ functional.assignment_flow — pass

Assignment flow valid for all 0 job(s)

### ✅ functional.artifact_flow — pass

No completed jobs found — artifact flow not yet exercised

### ✅ functional.completion_package_flow — pass

No completed jobs found — completion package flow not yet exercised

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

### ✅ artifact.artifact_presence — pass

No completed jobs or procurements found — nothing to check

### ✅ artifact.artifact_schema — pass

No JSON files found in artifacts — nothing to validate

### ✅ artifact.manifest_hash_match — pass

No manifest files found in artifacts — nothing to verify

### ✅ artifact.artifact_uri_resolution — pass

No JSON files found in artifacts — nothing to check
_Duration: 1ms_

### ✅ artifact.reviewability_check — pass

No artifact directories found to check — nothing to review

### ⚠️ doctrine.max_one_llm_call_per_job — warn

LLM audit log not found — cannot verify call budget

### ⚠️ doctrine.no_llm_before_assignment — warn

LLM audit log not found — cannot verify pre-assignment calls

### ✅ doctrine.unsigned_handoff_only — pass

All 0 tx package(s) are unsigned — handoff boundary intact

### ✅ doctrine.deterministic_scoring_required — pass

No nondeterministic constructs detected in agent/core source
_Duration: 80ms_

### ✅ doctrine.workspace_scope_only — pass

No out-of-scope path references detected — workspace boundary intact
_Duration: 188ms_

### ✅ integration.rpc_health — pass

RPC healthy — chainId 1 (mainnet), block #24823391 (242ms)
_Duration: 242ms_

### ⚠️ integration.mcp_connectivity — warn

MCP endpoint returned HTTP 406 (https://agialpha.com/api/mcp)
_Duration: 161ms_

### ⚠️ integration.ipfs_health — warn

1 IPFS endpoint(s) unreachable, 2 healthy: cloudflare-ipfs
_Duration: 371ms_

### ✅ integration.github_sync_health — pass

Git repository is healthy and in sync
_Duration: 902ms_

### ✅ integration.file_system_permissions — pass

All 6 critical directories are accessible
_Duration: 1ms_

### ✅ determinism.artifact_hash_stability — pass

No hashable artifact files found — nothing to check

### ✅ determinism.normalized_input_consistency — pass

No normalized input files found — nothing to check
_Duration: 1ms_

### ✅ determinism.repeated_run_same_output — pass

No runnable input files found — nothing to check
_Duration: 1ms_

### ✅ determinism.scoring_determinism — pass

No scoring files found — nothing to check

### ⚠️ performance.discovery_latency — warn

Discovery endpoint returned HTTP 406 — cannot measure latency
_Duration: 67ms_

### ✅ performance.execution_latency — pass

No completed jobs with timing data found

### ✅ performance.llm_budget_usage — pass

LLM audit log not found — no LLM usage recorded yet
_Duration: 1ms_

### ✅ performance.memory_usage — pass

Memory healthy: heap 16MB / 31MB (52%), RSS: 91MB

### ✅ performance.package_build_latency — pass

No package build timing data found

### ✅ economics.application_selectivity — pass

No job state files found — nothing to assess
_Duration: 1ms_

### ✅ economics.bad_job_filtering — pass

All 0 active job(s) passed bad-job filter checks

### ✅ economics.cost_reward_ratio — pass

All 0 completed job(s) exceed 1.5x cost/reward ratio

### ✅ economics.expected_value_estimation — pass

No applied jobs found — EV not computable yet
