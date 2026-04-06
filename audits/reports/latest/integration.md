# integration Audit Report

⚠️ **Status: WARN**

| Metric | Value |
|---|---|
| Started | 2026-04-06T21:42:20.153Z |
| Completed | 2026-04-06T21:42:20.153Z |
| Duration | 0ms |
| Pass | 3 |
| Warn | 2 |
| Fail | 0 |
| Critical | 0 |

## Checks

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
