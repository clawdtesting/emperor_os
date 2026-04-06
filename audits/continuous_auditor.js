// audits/continuous_auditor.js
// Runs audits on a recurring schedule and alerts on degradation.
// Designed to run as a long-lived background process alongside the agent.
// Writes results to disk and broadcasts SSE events when status changes.
//
// Usage: node audits/continuous_auditor.js [--profile <name>] [--interval <ms>]

import { fileURLToPath } from "url";
import { writeFileSync, mkdirSync, existsSync, readFileSync, renameSync } from "fs";
import { resolve, join } from "path";
import { runAll } from "./run_all.js";
import { AUDITS_ROOT } from "./lib/constants.js";

const __filename = fileURLToPath(import.meta.url);

const STATE_DIR = join(AUDITS_ROOT, "state");
const LAST_RESULT_FILE = join(STATE_DIR, "continuous_last.json");
const DEGRADATION_LOG = join(STATE_DIR, "degradation.log.jsonl");

const DEFAULT_INTERVALS = {
  fast: 5 * 60 * 1000,      // 5 minutes
  runtime: 2 * 60 * 1000,   // 2 minutes
  full: 60 * 60 * 1000,     // 1 hour
  presign: null,             // presign is never scheduled — always triggered
};

function parseArgs(argv) {
  const args = { profile: "runtime", interval: null, once: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--profile" && argv[i + 1]) args.profile = argv[++i]
    else if (argv[i] === "--interval" && argv[i + 1]) args.interval = parseInt(argv[++i], 10)
    else if (argv[i] === "--once") args.once = true
  }
  return args
}

function loadLastResult() {
  try {
    return JSON.parse(readFileSync(LAST_RESULT_FILE, "utf8"))
  } catch {
    return null
  }
}

function saveLastResult(result) {
  try {
    mkdirSync(STATE_DIR, { recursive: true })
    const tmp = LAST_RESULT_FILE + ".tmp"
    writeFileSync(tmp, JSON.stringify(result, null, 2))
    renameSync(tmp, LAST_RESULT_FILE)
  } catch {}
}

function appendDegradationLog(entry) {
  try {
    mkdirSync(STATE_DIR, { recursive: true })
    writeFileSync(DEGRADATION_LOG, JSON.stringify(entry) + "\n", { flag: "a" })
  } catch {}
}

function detectDegradation(prev, curr) {
  if (!prev) return null
  const prevStatus = prev.status
  const currStatus = curr.status

  const ORDER = { pass: 0, warn: 1, fail: 2, critical: 3 }
  if ((ORDER[currStatus] ?? 0) > (ORDER[prevStatus] ?? 0)) {
    return {
      type: "degradation",
      from: prevStatus,
      to: currStatus,
      at: new Date().toISOString(),
      newCritical: curr.checks?.filter(c =>
        c.status === "critical" &&
        !prev.checks?.find(p => p.name === c.name && p.status === "critical")
      ) || [],
    }
  }

  if ((ORDER[currStatus] ?? 0) < (ORDER[prevStatus] ?? 0)) {
    return {
      type: "recovery",
      from: prevStatus,
      to: currStatus,
      at: new Date().toISOString(),
    }
  }

  return null
}

async function runCycle(profile) {
  const cycleStart = Date.now()
  console.error(`[continuous] cycle start — profile=${profile} at ${new Date().toISOString()}`)

  let result
  try {
    result = await runAll({ profile })
  } catch (err) {
    console.error(`[continuous] runAll failed: ${err.message}`)
    return null
  }

  const prev = loadLastResult()
  const degradation = detectDegradation(prev, result)

  if (degradation) {
    appendDegradationLog(degradation)

    if (degradation.type === "degradation") {
      console.error(
        `[continuous] ⚠ STATUS DEGRADED: ${degradation.from} → ${degradation.to}` +
        (degradation.newCritical.length > 0
          ? ` — new critical: ${degradation.newCritical.map(c => c.name).join(", ")}`
          : "")
      )
    } else {
      console.error(`[continuous] ✓ STATUS RECOVERED: ${degradation.from} → ${degradation.to}`)
    }
  }

  saveLastResult(result)

  const s = result.summary
  const elapsed = Date.now() - cycleStart
  const icon = result.status === "pass" ? "✓" : result.status === "warn" ? "⚠" : "✗"
  console.error(
    `[continuous] ${icon} ${result.status.toUpperCase()} — pass=${s.pass} warn=${s.warn} critical=${s.critical} (${elapsed}ms)`
  )

  return { result, degradation }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const profile = args.profile

  if (profile === "presign") {
    console.error("[continuous] ERROR: presign profile cannot be scheduled — it must be triggered explicitly")
    process.exit(1)
  }

  mkdirSync(STATE_DIR, { recursive: true })

  if (args.once) {
    const { result } = await runCycle(profile) || {}
    process.exit(result?.status === "pass" || result?.status === "warn" ? 0 : 1)
    return
  }

  const intervalMs = args.interval || DEFAULT_INTERVALS[profile] || DEFAULT_INTERVALS.runtime
  console.error(`[continuous] starting — profile=${profile} interval=${intervalMs / 1000}s`)

  await runCycle(profile)

  setInterval(async () => {
    await runCycle(profile)
  }, intervalMs)

  process.on("SIGTERM", () => {
    console.error("[continuous] SIGTERM received — shutting down")
    process.exit(0)
  })

  process.on("SIGINT", () => {
    console.error("[continuous] SIGINT received — shutting down")
    process.exit(0)
  })
}

if (process.argv[1] === __filename) {
  main().catch(err => {
    console.error("Fatal:", err.message)
    process.exit(2)
  })
}
