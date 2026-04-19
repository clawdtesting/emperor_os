// prime-monitor.js
// Restart-safe Prime procurement monitoring loop.
//
// Responsibilities:
//   1. Discover new ProcurementCreated events
//   2. Refresh state of all active procurements from chain
//   3. Recompute phase + next action for each
//   4. Detect ShortlistFinalized events (to catch shortlisting)
//   5. Detect deadline proximity and emit warnings
//   6. Persist chain snapshots + next_action files
//   7. Resume seamlessly after process restart
//
// SAFETY CONTRACT:
//   - Dispatches validator scoring (unsigned tx packages only) when next-action requires it.
//   - No signing. No broadcasting. Produces unsigned tx files for operator review.

import { CONFIG } from "./config.js";
import {
  fetchProcurement,
  fetchApplicationView,
  scanProcurementCreatedEvents,
  scanShortlistFinalizedEvents,
  scanWinnerDesignatedEvents,
  getCurrentBlock,
  getBlockHash,
} from "./prime-client.js";
import {
  deriveChainPhase,
  secondsUntilDeadline,
  didMissRequiredWindow,
  PROC_STATUS,
  toCanonicalPhase,
} from "./prime-phase-model.js";
import { computeNextAction, getDeadlineWarnings } from "./prime-next-action.js";
import {
  getOrCreateProcState,
  getProcState,
  setProcState,
  transitionProcStatus,
  listActiveProcurements,
  writeProcCheckpoint,
  procRootDir,
} from "./prime-state.js";
import { inspectProcurement } from "./prime-inspector.js";
import { readJson, writeJson } from "./prime-state.js";
import { isFinalizedBlock, reconcileWinnerEvidence } from "./prime-settlement.js";
import {
  runValidatorScoreCommit,
  runValidatorScoreReveal,
} from "./prime-validator-scoring.js";
import { writeReconciliationSnapshot } from "./prime-reconciliation.js";
import { promises as fs } from "fs";
import path from "path";

// ── Monitor config ────────────────────────────────────────────────────────────

const SCAN_BLOCKS = 1000
const POLL_INTERVAL_MS  = 60_000;
const MONITOR_STATE_FILE = path.join(CONFIG.WORKSPACE_ROOT, "prime_monitor_state.json");
const MONITOR_HEALTH_FILE = path.join(CONFIG.WORKSPACE_ROOT, "monitor_health.json");
const REORG_SAFETY_BLOCKS = Number(process.env.PRIME_MONITOR_REORG_SAFETY_BLOCKS ?? "24");
const MAX_CONSECUTIVE_FAILURES = Number(process.env.PRIME_MONITOR_MAX_FAILURES ?? "5");

async function loadMonitorState() {
  const data = await readJson(MONITOR_STATE_FILE, null);
  return data ?? {
    lastProcurementBlock: 24780900,
    lastShortlistBlock:   0,
    lastWinnerBlock:      0,
    lastObservedHead:     0,
    startedAt:            new Date().toISOString(),
    cycles:               0,
    cursorAnchors:        {},
  };
}

async function saveMonitorState(state) {
  await writeJson(MONITOR_STATE_FILE, { ...state, updatedAt: new Date().toISOString() });
}

async function loadMonitorHealth() {
  return readJson(MONITOR_HEALTH_FILE, {
    status: "healthy",
    consecutiveFailures: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
    failureHistory: [],
    fatalThreshold: MAX_CONSECUTIVE_FAILURES,
  });
}

async function saveMonitorHealth(health) {
  await writeJson(MONITOR_HEALTH_FILE, health);
}

async function recordMonitorSuccess() {
  const health = await loadMonitorHealth();
  health.consecutiveFailures = 0;
  health.lastSuccessAt = new Date().toISOString();
  health.status = "healthy";
  await saveMonitorHealth(health);
}

async function recordMonitorFailure(err) {
  const health = await loadMonitorHealth();
  health.consecutiveFailures = (health.consecutiveFailures ?? 0) + 1;
  health.lastFailureAt = new Date().toISOString();
  health.lastError = err.message;
  health.failureHistory = [
    ...(health.failureHistory ?? []).slice(-20),
    { at: new Date().toISOString(), error: err.message, cycle: err.cycle ?? null },
  ];
  if (health.consecutiveFailures >= health.fatalThreshold) {
    health.status = "FATAL";
    health.fatalAt = new Date().toISOString();
    log(`MONITOR FATAL: ${health.consecutiveFailures} consecutive failures. Monitor is stalled.`);
  } else {
    health.status = "degraded";
  }
  await saveMonitorHealth(health);
  return health;
}

// ── Main monitor loop ─────────────────────────────────────────────────────────

/**
 * Starts the Prime monitoring loop.
 * Runs indefinitely, polling at POLL_INTERVAL_MS.
 * Safe to restart — resumes from persisted block cursors.
 *
 * @param {object} [opts]
 * @param {string} [opts.agentAddress]  - our agent address for applicationView
 * @param {boolean} [opts.once]         - if true, run one cycle then return (for testing/CI)
 */
export async function startPrimeMonitor({ agentAddress, once = false } = {}) {
  if (!process.env.ETH_RPC_URL) {
    log("ERROR: ETH_RPC_URL not set. Cannot start Prime monitor.");
    return;
  }

  log(`Prime monitor starting. agentAddress=${agentAddress ?? "not set"} once=${once}`);

  const monitorState = await loadMonitorState();
  log(`Resuming from procBlock=${monitorState.lastProcurementBlock} shortlistBlock=${monitorState.lastShortlistBlock}`);

  async function cycle() {
    monitorState.cycles = (monitorState.cycles ?? 0) + 1;
    log(`Cycle #${monitorState.cycles}`);

    try {
      // 1. Discover new procurements
      await discoverNewProcurements(monitorState, agentAddress);

      // 2. Scan for shortlist events for active procurements
      await detectShortlistEvents(monitorState, agentAddress);
      await detectWinnerDesignations(monitorState, agentAddress);

      // 3. Refresh all active procurement states
      await refreshActiveProcurements(agentAddress);

      // 4. Save monitor state
      await saveMonitorState(monitorState);

      // 5. Record success
      await recordMonitorSuccess();

      log(`Cycle #${monitorState.cycles} complete.`);
    } catch (err) {
      err.cycle = monitorState.cycles;
      log(`Cycle #${monitorState.cycles} error: ${err.message}`);
      const health = await recordMonitorFailure(err);
      if (health.status === "FATAL") {
        log(`Monitor entering FATAL state after ${health.consecutiveFailures} consecutive failures. Stopping.`);
        if (once) return;
        clearInterval(handle);
        return;
      }
    }
  }

  await cycle();

  if (once) return;

  const handle = setInterval(cycle, POLL_INTERVAL_MS);
  log(`Polling every ${POLL_INTERVAL_MS / 1000}s. Ctrl+C to stop.`);
  return handle;
}

// ── Discovery ─────────────────────────────────────────────────────────────────

async function discoverNewProcurements(monitorState, agentAddress) {
  const currentBlock = await getCurrentBlock();
  const safeToBlock = Math.max(0, currentBlock - REORG_SAFETY_BLOCKS);
  await reconcileReorgCursors(monitorState);
  if (Number(monitorState.lastObservedHead ?? 0) > currentBlock) {
    const rewindTo = Math.max(0, safeToBlock - SCAN_BLOCKS);
    monitorState.lastProcurementBlock = rewindTo;
    monitorState.lastShortlistBlock = rewindTo;
    monitorState.lastWinnerBlock = rewindTo;
    log(`Reorg/head rollback detected. Rewinding cursors to ${rewindTo}`);
  }
  monitorState.lastObservedHead = currentBlock;
  const fromBlock    = monitorState.lastProcurementBlock > 0
    ? monitorState.lastProcurementBlock + 1
    : Math.max(0, safeToBlock - SCAN_BLOCKS);

  if (fromBlock > safeToBlock) {
    monitorState.lastProcurementBlock = safeToBlock;
    return;
  }

  log(`Scanning ProcurementCreated events ${fromBlock}→${safeToBlock} (head=${currentBlock})…`);
  const events = await scanProcurementCreatedEvents(fromBlock, safeToBlock);
  log(`Found ${events.length} new ProcurementCreated event(s).`);

  for (const evt of events) {
    const { procurementId, jobId, employer } = evt;
    const existing = await getProcState(procurementId);
    if (existing) {
      log(`  #${procurementId} already tracked (status=${existing.status})`);
      continue;
    }

    log(`  #${procurementId} new — jobId=${jobId}, employer=${employer}`);

    // Create initial state
    await getOrCreateProcState(procurementId, jobId);

    // Run initial inspection
    try {
      const bundle = await inspectProcurement({
        procurementId,
        agentAddress,
        writeArtifacts: true,
      });
      await setProcState(procurementId, {
        linkedJobId:   jobId,
        employer:      employer,
        lastChainSync: new Date().toISOString(),
      });
      log(`  #${procurementId} inspected — chainPhase=${bundle.procurementSnapshot.chainPhase}`);
    } catch (err) {
      log(`  #${procurementId} inspection failed: ${err.message}`);
    }
  }

  monitorState.lastProcurementBlock = safeToBlock;
  await updateCursorAnchor(monitorState, "procurement", safeToBlock);
}

// ── Shortlist detection ───────────────────────────────────────────────────────

async function detectShortlistEvents(monitorState, agentAddress) {
  if (!agentAddress) return;

  const currentBlock = await getCurrentBlock();
  const safeToBlock = Math.max(0, currentBlock - REORG_SAFETY_BLOCKS);
  const fromBlock    = monitorState.lastShortlistBlock > 0
    ? monitorState.lastShortlistBlock + 1
    : Math.max(0, safeToBlock - SCAN_BLOCKS);

  if (fromBlock > safeToBlock) {
    monitorState.lastShortlistBlock = safeToBlock;
    return;
  }

  log(`Scanning ShortlistFinalized events ${fromBlock}→${safeToBlock} (head=${currentBlock})…`);
  const events = await scanShortlistFinalizedEvents(fromBlock, safeToBlock);

  const myAddr = agentAddress.toLowerCase();
  for (const evt of events) {
    const { procurementId, finalists } = evt;
    const isFinalist = finalists.includes(myAddr);
    log(`  ShortlistFinalized #${procurementId} — finalists=[${finalists.join(",")}] weAreFinalist=${isFinalist}`);

    if (!isFinalist) continue;

    const state = await getProcState(procurementId);
    if (!state) { log(`  #${procurementId} not in our state — skipping`); continue; }

    // Mark shortlisted in state if not already done
    if (!state.shortlisted) {
      await setProcState(procurementId, {
        shortlisted:    true,
        shortlistBlock: evt.blockNumber,
      });
      log(`  #${procurementId} SHORTLISTED at block ${evt.blockNumber}`);
    }
  }

  monitorState.lastShortlistBlock = safeToBlock;
  await updateCursorAnchor(monitorState, "shortlist", safeToBlock);
}

async function detectWinnerDesignations(monitorState, agentAddress) {
  if (!agentAddress) return;
  const currentBlock = await getCurrentBlock();
  const safeToBlock = Math.max(0, currentBlock - REORG_SAFETY_BLOCKS);
  const fromBlock = monitorState.lastWinnerBlock > 0
    ? monitorState.lastWinnerBlock + 1
    : Math.max(0, safeToBlock - SCAN_BLOCKS);
  if (fromBlock > safeToBlock) {
    monitorState.lastWinnerBlock = safeToBlock;
    return;
  }
  const events = await scanWinnerDesignatedEvents(fromBlock, safeToBlock);
  const myAddr = agentAddress.toLowerCase();
  for (const evt of events) {
    const finalized = isFinalizedBlock(evt.blockNumber, currentBlock);
    const state = await getProcState(evt.procurementId);
    if (!state) continue;
    const evidence = [...(state.winnerEvidence ?? []), { ...evt, finalized }];
    const reconciled = reconcileWinnerEvidence(evidence);
    await setProcState(evt.procurementId, {
      winnerEvidence: evidence,
      selected: reconciled.selected === myAddr,
      selectionBlock: reconciled.blockNumber ? String(reconciled.blockNumber) : null,
      winnerReconcile: reconciled,
    });
  }
  monitorState.lastWinnerBlock = safeToBlock;
  await updateCursorAnchor(monitorState, "winner", safeToBlock);
}

async function updateCursorAnchor(monitorState, key, blockNumber) {
  if (!Number.isFinite(Number(blockNumber)) || Number(blockNumber) <= 0) return;
  const blockHash = await getBlockHash(Number(blockNumber));
  monitorState.cursorAnchors = {
    ...(monitorState.cursorAnchors ?? {}),
    [key]: { blockNumber: Number(blockNumber), blockHash, checkedAt: new Date().toISOString() },
  };
}

async function reconcileReorgCursors(monitorState) {
  const anchors = monitorState.cursorAnchors ?? {};
  let reorgDetected = false;
  for (const [key, anchor] of Object.entries(anchors)) {
    if (!anchor?.blockNumber || !anchor?.blockHash) continue;
    const currentHash = await getBlockHash(Number(anchor.blockNumber));
    if (currentHash && currentHash === anchor.blockHash) continue;
    const rewindTo = Math.max(0, Number(anchor.blockNumber) - REORG_SAFETY_BLOCKS - SCAN_BLOCKS);
    if (key === "procurement") monitorState.lastProcurementBlock = rewindTo;
    if (key === "shortlist") monitorState.lastShortlistBlock = rewindTo;
    if (key === "winner") monitorState.lastWinnerBlock = rewindTo;
    log(`Reorg detected at ${key} cursor block ${anchor.blockNumber}. Rewinding to ${rewindTo}`);
    reorgDetected = true;
  }
  if (reorgDetected) {
    monitorState.lastReorgAt = new Date().toISOString();
    monitorState.reorgCount = (monitorState.reorgCount ?? 0) + 1;
  }
}

async function checkProcurementReorgIntegrity(procurementId, state) {
  if (!state?.lastChainSync) return { ok: true };
  const syncBlock = state.lastChainSyncBlock ?? null;
  if (!syncBlock) return { ok: true };

  try {
    const currentHash = await getBlockHash(Number(syncBlock));
    const storedHash = state.lastChainSyncBlockHash ?? null;
    if (storedHash && currentHash && currentHash !== storedHash) {
      return {
        ok: false,
        reason: "reorg",
        syncBlock,
        storedHash,
        currentHash,
        message: `Procurement #${procurementId} synced at block ${syncBlock} which has been reorged`,
      };
    }
  } catch {
    return { ok: true, reason: "hash-check-failed" };
  }
  return { ok: true };
}

// ── Refresh active procurements ───────────────────────────────────────────────

async function refreshActiveProcurements(agentAddress) {
  const active = await listActiveProcurements();
  if (active.length === 0) { log("No active procurements to refresh."); return; }

  log(`Refreshing ${active.length} active procurement(s)…`);
  const now = Math.floor(Date.now() / 1000);

  for (const state of active) {
    const { procurementId } = state;
    try {
      // Check if this procurement's sync block has been reorged
      const reorgCheck = await checkProcurementReorgIntegrity(procurementId, state);
      if (!reorgCheck.ok) {
        log(`  #${procurementId} REORG DETECTED — ${reorgCheck.message}. Rolling back state.`);
        // Roll back submitted states that may have been based on reorged chain data
        const rollbackMap = {
          [PROC_STATUS.COMMIT_SUBMITTED]: PROC_STATUS.COMMIT_READY,
          [PROC_STATUS.REVEAL_SUBMITTED]: PROC_STATUS.REVEAL_READY,
          [PROC_STATUS.FINALIST_ACCEPT_SUBMITTED]: PROC_STATUS.FINALIST_ACCEPT_READY,
          [PROC_STATUS.TRIAL_SUBMITTED]: PROC_STATUS.TRIAL_READY,
          [PROC_STATUS.COMPLETION_SUBMITTED]: PROC_STATUS.COMPLETION_READY,
        };
        const rollbackTo = rollbackMap[state.status];
        if (rollbackTo) {
          await setProcState(procurementId, {
            status: rollbackTo,
            reorgRolledBackAt: new Date().toISOString(),
            reorgPreviousStatus: state.status,
            reorgSyncBlock: reorgCheck.syncBlock,
          });
          log(`  #${procurementId}: rolled back ${state.status} → ${rollbackTo}`);
        }
        continue;
      }

      // Fetch fresh chain data
      const procStruct = await fetchProcurement(procurementId);
      const appView    = agentAddress ? await fetchApplicationView(procurementId, agentAddress) : null;

      // Recompute next action
      const nextAction = computeNextAction({ procState: state, procStruct, appView, nowSecs: now });
      const chainPhase = deriveChainPhase(procStruct, now);

      if (didMissRequiredWindow(state.status, chainPhase)) {
        await transitionProcStatus(procurementId, PROC_STATUS.MISSED_WINDOW, {
          missedWindowAt: new Date().toISOString(),
          missedWindowReason: `Required action window missed while in ${state.status} during ${chainPhase}`,
        });
      }

      // Deadline warnings
      const warnings = getDeadlineWarnings(procStruct, now);
      if (warnings.length > 0) {
        log(`  #${procurementId} DEADLINE WARNINGS:`);
        for (const w of warnings) log(`    ${w}`);
      }

      // Persist chain snapshot + next action
      const currentBlock = await getCurrentBlock();
      const blockHash = await getBlockHash(currentBlock);
      await writeProcCheckpoint(procurementId, "chain_snapshot.json", {
        procurementId:  String(procurementId),
        snapshotAt:     new Date().toISOString(),
        chainPhase,
        procurement:    procStruct,
        applicationView: appView ?? null,
        deadlineWarnings: warnings,
        syncBlock:      currentBlock,
        syncBlockHash:  blockHash,
      });

      await writeProcCheckpoint(procurementId, "next_action.json", nextAction);
      await writeReconciliationSnapshot({ procurementId, nextAction });

      // Dispatch validator scoring actions when applicable
      if (nextAction.action === "BUILD_VALIDATOR_SCORE_COMMIT_TX" && agentAddress) {
        try {
          log(`  #${procurementId} dispatching validator score commit…`);
          await runValidatorScoreCommit({ procurementId, validatorAddress: agentAddress });
        } catch (err) {
          log(`  #${procurementId} validator score commit failed: ${err.message}`);
        }
      }
      if (nextAction.action === "BUILD_VALIDATOR_SCORE_REVEAL_TX" && agentAddress) {
        try {
          log(`  #${procurementId} dispatching validator score reveal…`);
          await runValidatorScoreReveal({ procurementId, validatorAddress: agentAddress });
        } catch (err) {
          log(`  #${procurementId} validator score reveal failed: ${err.message}`);
        }
      }

      // Update state lastChainSync with block hash for reorg detection
      await setProcState(procurementId, {
        lastChainSync: new Date().toISOString(),
        lastChainSyncBlock: currentBlock,
        lastChainSyncBlockHash: blockHash,
      });

      log(`  #${procurementId} refreshed — status=${state.status} action=${nextAction.action}` +
          (nextAction.blockedReason ? ` BLOCKED: ${nextAction.blockedReason}` : ""));

    } catch (err) {
      log(`  #${procurementId} refresh error: ${err.message}`);
    }
  }
}

// ── Status summary (human-readable) ──────────────────────────────────────────

/**
 * Prints a summary of all tracked procurements to console.
 * Safe to call at any time — read-only.
 */
export async function printMonitorSummary() {
  const all = await listActiveProcurements();
  console.log(`\n══ Prime Monitor Summary ══════════════════════════════`);
  console.log(`  Active procurements: ${all.length}`);
  for (const s of all) {
    const nextAction = await readJson(
      path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${s.procurementId}`, "next_action.json"),
      null
    );
    const action = nextAction?.action ?? "unknown";
    const blocked = nextAction?.blockedReason ? ` | BLOCKED: ${nextAction.blockedReason}` : "";
    console.log(`  #${s.procurementId.padEnd(6)} status=${s.status.padEnd(30)} action=${action}${blocked}`);
  }
  console.log("");
}

// ── Entry point (direct execution) ───────────────────────────────────────────

function log(msg) {
  console.log(`[prime-monitor] ${new Date().toISOString()} ${msg}`);
}
