// audits/lib/process_utils.js
// Process utilities for audit checks — spawning, running audits, capturing output.

import { spawn } from "child_process";

export function runAuditScript(scriptPath, opts = {}) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const proc = spawn("node", [scriptPath], {
      cwd: opts.cwd || process.cwd(),
      env: { ...process.env, ...(opts.env || {}) },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    proc.on("close", (code) => {
      resolve({
        exitCode: code,
        stdout,
        stderr,
        durationMs: Date.now() - start,
        ok: code === 0,
      });
    });

    proc.on("error", (err) => {
      reject(err);
    });

    if (opts.timeoutMs) {
      setTimeout(() => {
        proc.kill("SIGTERM");
        reject(new Error(`Audit script timed out after ${opts.timeoutMs}ms: ${scriptPath}`));
      }, opts.timeoutMs);
    }
  });
}

export async function runAuditScriptsSequentially(scriptPaths, opts = {}) {
  const results = [];
  for (const path of scriptPaths) {
    try {
      const result = await runAuditScript(path, opts);
      results.push({ script: path, ...result });
    } catch (err) {
      results.push({ script: path, ok: false, error: err.message, exitCode: -1, stdout: "", stderr: "", durationMs: 0 });
    }
  }
  return results;
}

export async function runAuditScriptsParallel(scriptPaths, opts = {}) {
  return Promise.all(
    scriptPaths.map(async (path) => {
      try {
        const result = await runAuditScript(path, opts);
        return { script: path, ...result };
      } catch (err) {
        return { script: path, ok: false, error: err.message, exitCode: -1, stdout: "", stderr: "", durationMs: 0 };
      }
    })
  );
}
