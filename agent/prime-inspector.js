// prime-inspector.js
// Produces a full procurement inspection bundle from chain state.
//
// Outputs:
//   artifacts/proc_<id>/inspection/procurement_snapshot.json
//   artifacts/proc_<id>/inspection/linked_job_snapshot.json
//   artifacts/proc_<id>/inspection/deadlines_and_windows.json
//   artifacts/proc_<id>/inspection/phase_snapshot.json
//   artifacts/proc_<id>/inspection/next_action.json
//
// SAFETY CONTRACT: Read-only. No signing. No state writes (only inspection artifacts).

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CONFIG } from "./config.js";
import {
  fetchProcurement,
  fetchApplicationView,
  getCurrentBlock,
} from "./prime-client.js";
import {
  deriveChainPhase,
  secondsUntilDeadline,
  formatDeadlineStatus,
  APP_PHASE,
} from "./prime-phase-model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Artifact path helpers ─────────────────────────────────────────────────────

export function procArtifactDir(procurementId) {
  return path.join(
    CONFIG.WORKSPACE_ROOT,
    "artifacts",
    `proc_${procurementId}`
  );
}

export function inspectionDir(procurementId) {
  return path.join(procArtifactDir(procurementId), "inspection");
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeJsonAtomic(filePath, data) {
  const tmp = `${filePath}.tmp.${Date.now()}.${Buffer.from(filePath).toString('hex').slice(0, 6)}`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, filePath);
}

// ── Main inspection function ──────────────────────────────────────────────────

/**
 * Runs a full read-only inspection of a procurement.
 * Writes inspection artifacts to artifacts/proc_<id>/inspection/.
 *
 * @param {object} opts
 * @param {string|number} opts.procurementId
 * @param {string} [opts.agentAddress] - our agent address for applicationView
 * @param {boolean} [opts.writeArtifacts] - default true; set false for dry-run
 * @returns {Promise<InspectionBundle>}
 */
export async function inspectProcurement({ procurementId, agentAddress, writeArtifacts = true }) {
  const id  = String(procurementId);
  const now = Math.floor(Date.now() / 1000);

  // 1. Fetch procurement struct from chain
  const proc = await fetchProcurement(id);

  // 2. Fetch current block
  const currentBlock = await getCurrentBlock();

  // 3. Derive chain phase and deadline info
  const chainPhase    = deriveChainPhase(proc, now);
  const secsRemaining = secondsUntilDeadline(proc, now);
  const deadlineLabel = formatDeadlineStatus(proc, now);

  // 4. Build deadline windows
  const deadlines = buildDeadlineWindows(proc, now);

  // 5. Fetch our application view if agent address provided
  let applicationView = null;
  if (agentAddress) {
    applicationView = await fetchApplicationView(id, agentAddress.toLowerCase());
  }

  // 6. Assemble procurement snapshot
  const procurementSnapshot = {
    procurementId: id,
    jobId:         proc.jobId,
    employer:      proc.employer,
    chainPhase,
    deadlineLabel,
    secsUntilNextDeadline: secsRemaining,
    deadlines: {
      commitDeadline:         proc.commitDeadline,
      revealDeadline:         proc.revealDeadline,
      finalistAcceptDeadline: proc.finalistAcceptDeadline,
      trialDeadline:          proc.trialDeadline,
      scoreCommitDeadline:    proc.scoreCommitDeadline,
      scoreRevealDeadline:    proc.scoreRevealDeadline,
    },
    snapshotAt:    new Date().toISOString(),
    blockNumber:   currentBlock,
  };

  // 7. Assemble application snapshot
  const agentStatus = applicationView ? {
    phase:          applicationView.phase,
    phaseName:      applicationView.phaseName,
    applicationURI: applicationView.applicationURI,
    commitment:     applicationView.commitment,
    shortlisted:    applicationView.shortlisted,
  } : null;

  // 8. Build phase snapshot (our position in the procurement)
  const phaseSnapshot = {
    procurementId:    id,
    chainPhase,
    agentAddress:     agentAddress ?? null,
    agentPhase:       agentStatus?.phase ?? null,
    agentPhaseName:   agentStatus?.phaseName ?? null,
    shortlisted:      agentStatus?.shortlisted ?? null,
    canCommit:        chainPhase === "COMMIT_OPEN",
    canReveal:        chainPhase === "REVEAL_OPEN" && agentStatus?.phase === 1,
    canAcceptFinalist:chainPhase === "FINALIST_ACCEPT" && agentStatus?.shortlisted === true,
    canSubmitTrial:   chainPhase === "TRIAL_OPEN" && agentStatus?.phase >= 3,
    snapshotAt:       new Date().toISOString(),
  };

  // 9. Assemble inspection bundle
  const bundle = {
    procurementSnapshot,
    linkedJobSnapshot: { jobId: proc.jobId, linkedAt: new Date().toISOString() },
    deadlinesAndWindows: deadlines,
    phaseSnapshot,
    agentStatus,
  };

  if (writeArtifacts) {
    const dir = inspectionDir(id);
    await ensureDir(dir);

    await writeJsonAtomic(path.join(dir, "procurement_snapshot.json"), procurementSnapshot);
    await writeJsonAtomic(path.join(dir, "linked_job_snapshot.json"),  bundle.linkedJobSnapshot);
    await writeJsonAtomic(path.join(dir, "deadlines_and_windows.json"),deadlines);
    await writeJsonAtomic(path.join(dir, "phase_snapshot.json"),       phaseSnapshot);
  }

  return bundle;
}

// ── Deadline window builder ───────────────────────────────────────────────────

function buildDeadlineWindows(proc, now) {
  const windows = [
    {
      name:     "Commit Window",
      phase:    "COMMIT_OPEN",
      deadline: proc.commitDeadline,
      status:   deadlineStatus(now, Number(proc.commitDeadline)),
    },
    {
      name:     "Reveal Window",
      phase:    "REVEAL_OPEN",
      opensAt:  proc.commitDeadline,
      deadline: proc.revealDeadline,
      status:   deadlineStatus(now, Number(proc.revealDeadline)),
    },
    {
      name:     "Finalist Accept Window",
      phase:    "FINALIST_ACCEPT",
      opensAt:  proc.revealDeadline,
      deadline: proc.finalistAcceptDeadline,
      status:   deadlineStatus(now, Number(proc.finalistAcceptDeadline)),
    },
    {
      name:     "Trial Submission Window",
      phase:    "TRIAL_OPEN",
      opensAt:  proc.finalistAcceptDeadline,
      deadline: proc.trialDeadline,
      status:   deadlineStatus(now, Number(proc.trialDeadline)),
    },
    {
      name:     "Score Commit Window",
      phase:    "SCORE_COMMIT",
      opensAt:  proc.trialDeadline,
      deadline: proc.scoreCommitDeadline,
      status:   deadlineStatus(now, Number(proc.scoreCommitDeadline)),
    },
    {
      name:     "Score Reveal Window",
      phase:    "SCORE_REVEAL",
      opensAt:  proc.scoreCommitDeadline,
      deadline: proc.scoreRevealDeadline,
      status:   deadlineStatus(now, Number(proc.scoreRevealDeadline)),
    },
  ];

  return {
    procurementId:  "unknown",  // caller fills in
    generatedAt:    new Date().toISOString(),
    nowUnixSecs:    now,
    windows,
  };
}

function deadlineStatus(now, deadlineUnix) {
  if (!deadlineUnix) return "NOT_SET";
  if (now < deadlineUnix) {
    const secsLeft = deadlineUnix - now;
    return `OPEN — ${formatDuration(secsLeft)} remaining (${new Date(deadlineUnix * 1000).toISOString()})`;
  }
  const secsAgo = now - deadlineUnix;
  return `CLOSED — passed ${formatDuration(secsAgo)} ago (${new Date(deadlineUnix * 1000).toISOString()})`;
}

function formatDuration(secs) {
  if (secs < 60)    return `${secs}s`;
  if (secs < 3600)  return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d ${Math.floor((secs % 86400) / 3600)}h`;
}

// ── Human-readable summary printer ───────────────────────────────────────────

/**
 * Prints a human-readable procurement summary to console.
 * Safe to call at any time — read-only.
 */
export function printInspectionSummary(bundle) {
  const { procurementSnapshot: p, phaseSnapshot: ph, agentStatus: a, deadlinesAndWindows: dw } = bundle;

  console.log(`\n══ Procurement #${p.procurementId} ══════════════════════════════════`);
  console.log(`  Job ID        : ${p.jobId}`);
  console.log(`  Employer      : ${p.employer}`);
  console.log(`  Chain Phase   : ${p.chainPhase} — ${p.deadlineLabel}`);
  console.log(`  Block         : ${p.blockNumber}`);
  console.log(`  Snapshot At   : ${p.snapshotAt}`);

  if (a) {
    console.log(`\n  Our Application:`);
    console.log(`    Phase       : ${a.phaseName} (${a.phase})`);
    console.log(`    Shortlisted : ${a.shortlisted}`);
    if (a.applicationURI) console.log(`    URI         : ${a.applicationURI}`);
  }

  console.log(`\n  Deadlines:`);
  for (const w of dw.windows) {
    console.log(`    ${w.name.padEnd(30)} ${w.status}`);
  }

  console.log(`\n  Actions Available:`);
  console.log(`    canCommit         : ${ph.canCommit}`);
  console.log(`    canReveal         : ${ph.canReveal}`);
  console.log(`    canAcceptFinalist : ${ph.canAcceptFinalist}`);
  console.log(`    canSubmitTrial    : ${ph.canSubmitTrial}`);
  console.log("");
}
