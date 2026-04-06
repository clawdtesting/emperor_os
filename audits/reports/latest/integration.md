# integration Audit Report

🚨 **Status: CRITICAL**

| Metric | Value |
|---|---|
| Started | 2026-04-06T21:37:49.747Z |
| Completed | 2026-04-06T21:37:49.747Z |
| Duration | 0ms |
| Pass | 3 |
| Warn | 1 |
| Fail | 0 |
| Critical | 1 |

## Checks

### ✅ integration.rpc_health — pass

RPC healthy — chainId 1 (mainnet), block #24823368 (247ms)
_Duration: 247ms_

### 🚨 integration.mcp_connectivity — critical

MCP endpoint returned HTTP 406 (https://agialpha.com/api/mcp)
_Duration: 166ms_

### ⚠️ integration.ipfs_health — warn

1 IPFS endpoint(s) unreachable, 2 healthy: cloudflare-ipfs
_Duration: 377ms_

### ✅ integration.github_sync_health — pass

Git repository is healthy and in sync
_Duration: 752ms_

### ✅ integration.file_system_permissions — pass

All 6 critical directories are accessible
_Duration: 1ms_
