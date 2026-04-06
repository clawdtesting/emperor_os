// audits/integration/run.js
// Integration audit family — verify external service connectivity and
// health: RPC endpoints, MCP connectivity, IPFS, GitHub sync, and
// filesystem permissions.

import { fileURLToPath } from "url";
import { buildAuditContext, addError } from "../lib/audit_context.js";
import { buildAuditReport } from "../lib/report_builder.js";
import { writeFullReport } from "../lib/result_writer.js";
import { elapsedMs } from "../lib/time_utils.js";

import * as fileSystemPermissions from "./checks/file_system_permissions.js";
import * as githubSyncHealth from "./checks/github_sync_health.js";
import * as ipfsHealth from "./checks/ipfs_health.js";
import * as mcpConnectivity from "./checks/mcp_connectivity.js";
import * as rpcHealth from "./checks/rpc_health.js";

const __filename = fileURLToPath(import.meta.url);

const CHECKS = [
  rpcHealth,
  mcpConnectivity,
  ipfsHealth,
  githubSyncHealth,
  fileSystemPermissions,
];

export async function run(opts = {}) {
  const ctx = buildAuditContext({ ...opts, auditFamily: "integration" });
  const startMs = Date.now();

  for (const check of CHECKS) {
    try {
      await check.run(ctx);
    } catch (err) {
      addError(ctx, err);
    }
  }

  const report = buildAuditReport("integration", ctx.checks, ctx.metrics);
  report.elapsedMs = elapsedMs(startMs);
  report.errors = ctx.errors;
  await writeFullReport(report, "integration");
  return report;
}

if (process.argv[1] === __filename) {
  run().then(r => {
    console.log(JSON.stringify(r.summary, null, 2));
    process.exit(r.status === "pass" ? 0 : 1);
  }).catch(err => {
    console.error(err.message);
    process.exit(2);
  });
}
