# protocol Audit Report

⚠️ **Status: WARN**

| Metric | Value |
|---|---|
| Started | 2026-04-06T21:42:18.783Z |
| Completed | 2026-04-06T21:42:18.783Z |
| Duration | 0ms |
| Pass | 6 |
| Warn | 1 |
| Fail | 0 |
| Critical | 0 |

## Checks

### ✅ protocol.chainid_validation — pass

Chain ID 1 is valid

### ✅ protocol.contract_address_validation — pass

All 3 contract addresses are valid and checksummed
_Duration: 2ms_

### ✅ protocol.function_selector_validation — pass

All 2 function selectors match canonical values: submitCompletion(uint256,string,bytes32)=0x5635b65d, approve(address,uint256)=0x095ea7b3
_Duration: 4ms_

### ✅ protocol.calldata_encoding — pass

ABI encoding verified for submitCompletion — selector=0x5635b65d
_Duration: 1ms_

### ✅ protocol.calldata_decoding — pass

ABI decoding utilities verified for AGI contract signatures
_Duration: 1ms_

### ✅ protocol.erc20_approval_flow — pass

ERC20 approve calldata encodes correctly — selector=0x095ea7b3, spender=0xB3AAeb69b630f0299791679c063d68d6687481d1

### ⚠️ protocol.prime_deadline_logic — warn

No deadline-related code found in agent/core — PRIME deadline logic may be missing
_Duration: 356ms_
