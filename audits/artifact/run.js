// audits/artifact/run.js
// Artifact audit family — verify completeness, integrity, and reviewability
// of all job and procurement artifacts on disk.

import { fileURLToPath } from "url";
import { buildAuditContext, addError } from "../lib/audit_context.js";
import { buildAuditReport } from "../lib/report_builder.js";
import { writeFullReport } from "../lib/result_writer.js";
import { elapsedMs } from "../lib/time_utils.js";

import * as manifestHashMatch from "./checks/artifact_manifest_hash_match.js";
import * as artifactPresence from "./checks/artifact_presence.js";
import * as artifactSchema from "./checks/artifact_schema.js";
import * as artifactUriResolution from "./checks/artifact_uri_resolution.js";
import * as reviewability from "./checks/reviewability_check.js";

const __filename = fileURLToPath(import.meta.url);

const CHECKS = [
  artifactPresence,
  artifactSchema,
  manifestHashMatch,
  artifactUriResolution,
  reviewability,
];

export async function run(opts = {}) {
  const ctx = buildAuditContext({ ...opts, auditFamily: "artifact" });
  const startMs = Date.now();

  for (const check of CHECKS) {
    try {
      await check.run(ctx);
    } catch (err) {
      addError(ctx, err);
    }
  }

  const report = buildAuditReport("artifact", ctx.checks, ctx.metrics);
  report.elapsedMs = elapsedMs(startMs);
  report.errors = ctx.errors;
  await writeFullReport(report, "artifact");
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
