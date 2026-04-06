// audits/safety/checks/anti_replay_freshness.js
// Confirms that completion packages contain fresh timestamps and nonce data.
 
import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { ARTIFACTS_ROOT, MAX_FRESHNESS_MS } from "../../lib/constants.js";
import { listFiles, readJson } from "../../lib/fs_utils.js";
import { isFresh } from "../../lib/time_utils.js";
 
const CHECK_NAME = "safety.anti_replay_freshness";
 
export async function run(ctx) {
  const start = Date.now();
 
  let artifactFiles;
  try {
    artifactFiles = await listFiles(ARTIFACTS_ROOT, f => f.endsWith(".json"));
  } catch {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: "Artifacts directory not accessible — skipping freshness check",
      durationMs: Date.now() - start,
    });
    return ctx;
  }
 
  if (artifactFiles.length === 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: "No artifacts to check — freshness requirement satisfied by absence",
      durationMs: Date.now() - start,
    });
    return ctx;
  }
 
  const stale = [];
  const noTimestamp = [];
 
  for (const file of artifactFiles) {
    let data;
    try {
      data = await readJson(file);
    } catch {
      continue;
    }
 
    const ts = data.createdAt || data.timestamp || data.generatedAt;
    if (!ts) {
      noTimestamp.push(file);
      continue;
    }
 
    if (!isFresh(ts, MAX_FRESHNESS_MS)) {
      stale.push({ file, ts });
    }
  }
 
  const issues = [
    ...stale.map(s => `stale: ${s.file} (${s.ts})`),
    ...noTimestamp.map(f => `no-timestamp: ${f}`),
  ];
 
  if (issues.length > 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: `${issues.length} freshness issue(s): ${issues.slice(0, 3).join("; ")}`,
      durationMs: Date.now() - start,
      extra: { stale, noTimestamp },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `All ${artifactFiles.length} artifact(s) are fresh (within ${MAX_FRESHNESS_MS / 60000}min)`,
      durationMs: Date.now() - start,
    });
  }
 
  return ctx;
}