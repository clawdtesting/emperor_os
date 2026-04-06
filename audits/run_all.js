// audits/run_all.js
// Master audit runner — discovers and executes all audit families.
// Supports profiles: fast, full, presign, runtime.
// Usage: node audits/run_all.js [--profile <name>] [--json] [--md]

import { fileURLToPath, pathToFileURL } from "url";
import { resolve } from "path";
import { fileURLToPath as toFilePath } from "url";
import { buildMasterReport, reportToMarkdown } from "./lib/report_builder.js";
import { writeFullReport } from "./lib/result_writer.js";
import { getEnabledFamilies, getAuditMeta, getAuditRunnerPath } from "./lib/audit_registry.js";
import { AUDIT_FAMILIES } from "./lib/constants.js";

const __filename = fileURLToPath(import.meta.url);

function parseArgs(argv) {
  const args = { profile: "full", json: false, md: false, families: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--profile" && argv[i + 1]) args.profile = argv[++i]
    else if (argv[i] === "--json") args.json = true
    else if (argv[i] === "--md") args.md = true
    else if (argv[i] === "--families" && argv[i + 1]) args.families = argv[++i].split(",")
  }
  return args
}

async function loadRunner(family) {
  const runnerPath = getAuditRunnerPath(family)
  try {
    const mod = await import(pathToFileURL(runnerPath).href)
    if (typeof mod.run !== "function") throw new Error("no run() export")
    return mod
  } catch (err) {
    return null
  }
}

export async function runAll(opts = {}) {
  const profile = opts.profile || "full"
  const families = opts.families || getEnabledFamilies(profile)
  const startMs = Date.now()
  const startedAt = new Date().toISOString()

  console.error(`[audit] profile=${profile} families=${families.join(",")}`)

  const results = []
  const errors = []

  for (const family of families) {
    const meta = getAuditMeta(family)
    const label = meta?.label || family
    const t0 = Date.now()

    console.error(`[audit] running ${label}...`)

    const runner = await loadRunner(family)
    if (!runner) {
      console.error(`[audit] SKIP ${family} — runner not found or missing run()`)
      errors.push({ family, error: "runner not found" })
      continue
    }

    try {
      const report = await runner.run({ profile, auditFamily: family })
      const elapsed = Date.now() - t0
      console.error(`[audit] ${label} → ${report.status} (${elapsed}ms)`)
      results.push(report)

      if (opts.failFast && meta?.blocking && report.status === "critical") {
        console.error(`[audit] BLOCKING failure in ${family} — aborting (--fail-fast)`)
        break
      }
    } catch (err) {
      console.error(`[audit] ERROR in ${family}: ${err.message}`)
      errors.push({ family, error: err.message })
      results.push({
        auditType: family,
        status: "critical",
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - t0,
        summary: { pass: 0, warn: 0, fail: 0, critical: 1 },
        checks: [{ name: `${family}.runner_error`, status: "critical", details: err.message }],
        errors: [{ message: err.message }],
      })
    }
  }

  const master = buildMasterReport(results)
  master.startedAt = startedAt
  master.profile = profile
  master.errors = errors
  master.elapsedMs = Date.now() - startMs

  await writeFullReport(master, "master").catch(() => {})

  return master
}

if (process.argv[1] === __filename) {
  const args = parseArgs(process.argv.slice(2))
  const opts = {
    profile: args.profile,
    families: args.families || undefined,
    failFast: process.argv.includes("--fail-fast"),
  }

  runAll(opts).then(master => {
    if (args.md) {
      console.log(reportToMarkdown(master))
    } else if (args.json) {
      console.log(JSON.stringify(master, null, 2))
    } else {
      const s = master.summary
      const icon = master.status === "pass" ? "✓" : master.status === "warn" ? "⚠" : "✗"
      console.log(`\n${icon} Audit [${args.profile}] — ${master.status.toUpperCase()}`)
      console.log(`  pass=${s.pass} warn=${s.warn} fail=${s.fail} critical=${s.critical}  (${master.elapsedMs}ms)`)
      if (master.errors?.length > 0) {
        console.log(`  errors: ${master.errors.map(e => `${e.family}: ${e.error}`).join(", ")}`)
      }
    }
    process.exit(master.status === "pass" || master.status === "warn" ? 0 : 1)
  }).catch(err => {
    console.error("Fatal:", err.message)
    process.exit(2)
  })
}
