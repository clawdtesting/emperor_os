// prime-execution-bridge.js
// Bridges a selected Prime procurement into the linked AGIJobManager v1 job execution flow.
//
// When a Prime procurement results in selection, this module:
//   1. Confirms the selection state
//   2. Writes selection_to_execution_bridge.json
//   3. Writes linked_job_execution_state.json
//   4. Transitions procurement state to JOB_EXECUTION_IN_PROGRESS
//   5. Fetches the linked job spec via MCP
//   6. Writes normalized_job_spec.json for the execution phase
//   7. Ensures procurement provenance is preserved in all completion artifacts
//
// The actual job execution (LLM call, deliverable generation) is handled by
// the existing workspace agent pipeline (execute.js, validate.js, submit.js).
// This module is the handshake layer that links the two flows.
//
// SAFETY CONTRACT: No signing. No broadcasting. No LLM calls.
//                  Provenance tracking only.

import { promises as fs } from "fs";
import path from "path";
import { CONFIG } from "./config.js";
import {
  getProcState,
  setProcState,
  transitionProcStatus,
  ensureProcSubdir,
  writeProcCheckpoint,
  readJson,
  writeJson,
} from "./prime-state.js";
import { PROC_STATUS } from "./prime-phase-model.js";
import { fetchProcurement, fetchApplicationView } from "./prime-client.js";
import { getJobArtifactPaths, validateArtifactShape, ARTIFACT_REQUIRED_FIELDS } from "./artifact-manager.js";

// ── Bridge types ──────────────────────────────────────────────────────────────

/**
 * @typedef {object} ExecutionBridge
 * @property {string} procurementId
 * @property {string} linkedJobId
 * @property {string} selectedAgentAddress
 * @property {string} selectionBlock
 * @property {string} bridgedAt
 * @property {string} executionRootDir  - artifacts/proc_<id>/
 * @property {string} jobArtifactDir    - artifacts/job_<jobId>/ (v1 completion dir)
 * @property {string} status            - "active" | "completed" | "failed"
 * @property {string} provenanceNote
 */

// ── Main bridge function ──────────────────────────────────────────────────────

/**
 * Activates the selection-to-execution bridge for a procurement.
 * Idempotent — safe to call multiple times.
 *
 * @param {object} opts
 * @param {string|number} opts.procurementId
 * @param {string} [opts.agentAddress]      - our agent address
 * @param {string} [opts.selectionBlock]    - block number where selection occurred
 * @returns {Promise<ExecutionBridge>}
 */
export async function activateBridge({ procurementId, agentAddress, selectionBlock }) {
  const id    = String(procurementId);
  const state = await getProcState(id);

  if (!state) {
    throw new Error(`No procurement state for ${id}. Run inspection first.`);
  }

  if (!state.linkedJobId) {
    throw new Error(`Procurement ${id} has no linkedJobId recorded in state.`);
  }

  // Confirm selection from chain if possible
  let selectionConfirmed = state.selected === true;
  let agentAddr = agentAddress?.toLowerCase() ?? state.employer ?? "unknown";

  if (agentAddress && process.env.ETH_RPC_URL) {
    try {
      const appView = await fetchApplicationView(id, agentAddress);
      // Phase 4 = TrialSubmitted is a proxy indicator (contract may have winner designation)
      // We trust state.selected as set by monitor/operator
      selectionConfirmed = state.selected === true;
    } catch (err) {
      log(`Could not verify selection on chain for #${id}: ${err.message}`);
    }
  }

  if (!selectionConfirmed) {
    throw new Error(
      `Procurement ${id} selection not confirmed in state. ` +
      `Set state.selected = true before bridging.`
    );
  }

  const linkedJobId = state.linkedJobId;
  const bridgedAt   = new Date().toISOString();

  // Build execution root paths
  const procRoot    = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${id}`);
  const jobArtifact = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `job_${linkedJobId}`);

  // Ensure job artifact directory exists
  await fs.mkdir(jobArtifact, { recursive: true });

  // Write bridge artifact
  const bridge = {
    schema:               "emperor-os/prime-execution-bridge/v1",
    procurementId:        id,
    linkedJobId,
    selectedAgentAddress: agentAddr,
    selectionBlock:       selectionBlock ?? state.selectionBlock ?? "unknown",
    bridgedAt,
    executionRootDir:     procRoot,
    jobArtifactDir:       jobArtifact,
    status:               "active",
    provenanceNote:
      `This job was obtained via Prime procurement #${id}. ` +
      `All completion artifacts must reference procurementId=${id} for provenance.`,
  };

  await writeProcCheckpoint(id, "selection_to_execution_bridge.json", bridge);

  // Write linked_job_execution_state.json
  const execState = {
    schema:          "emperor-os/linked-job-execution-state/v1",
    procurementId:   id,
    linkedJobId,
    bridgedAt,
    phase:           "EXECUTING",
    jobSpecFetched:  false,
    deliverableReady: false,
    completionURISet: false,
    completionTxReady: false,
    updatedAt:       bridgedAt,
  };
  await writeProcCheckpoint(id, "linked_job_execution_state.json", execState);

  // Write provenance file into the v1 job artifact directory
  await fs.writeFile(
    path.join(jobArtifact, "procurement_provenance.json"),
    JSON.stringify({
      procurementId:   id,
      linkedJobId,
      bridgedAt,
      provenanceNote:  bridge.provenanceNote,
    }, null, 2),
    "utf8"
  );

  // Transition procurement state
  if (state.status === PROC_STATUS.SELECTED) {
    await transitionProcStatus(id, PROC_STATUS.JOB_EXECUTION_IN_PROGRESS, {
      jobExecutionStarted: bridgedAt,
    });
  }

  log(`Bridge activated for procurement #${id} → job #${linkedJobId}`);
  return bridge;
}

// ── Fetch linked job spec via MCP ─────────────────────────────────────────────

/**
 * Fetches the job spec for a linked job and writes it to the completion artifacts.
 * This is the Prime-specific wrapper around the existing MCP spec fetch flow.
 *
 * @param {object} opts
 * @param {string|number} opts.procurementId
 * @param {string|number} opts.linkedJobId
 * @returns {Promise<string|null>} raw spec content, or null if unavailable
 */
export async function fetchLinkedJobSpec({ procurementId, linkedJobId }) {
  const mcpEndpoint = CONFIG.AGI_ALPHA_MCP;
  if (!mcpEndpoint) {
    log("AGI_ALPHA_MCP not set — cannot fetch linked job spec");
    return null;
  }

  const id = String(procurementId);

  try {
    const res = await fetch(mcpEndpoint, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body:    JSON.stringify({
        jsonrpc: "2.0",
        id:      Date.now(),
        method:  "tools/call",
        params:  {
          name:      "fetch_job_metadata",
          arguments: { jobId: Number(linkedJobId), type: "spec" },
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) throw new Error(`MCP HTTP ${res.status}`);

    const contentType = res.headers.get("content-type") ?? "";
    const text        = await res.text();
    let specContent   = null;

    if (contentType.includes("text/event-stream")) {
      for (const line of text.split("\n")) {
        if (!line.startsWith("data:")) continue;
        try {
          const d = JSON.parse(line.slice(5).trim());
          if (d.result !== undefined) { specContent = unpackMcpResult(d.result); break; }
        } catch {}
      }
    } else {
      const d = JSON.parse(text);
      if (d.error) throw new Error(d.error.message);
      specContent = unpackMcpResult(d.result);
    }

    if (specContent) {
      // Write spec to both the proc completion dir and the v1 job artifact dir
      const compDir = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${id}`, "completion");
      const jobDir  = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `job_${linkedJobId}`);
      await fs.mkdir(compDir, { recursive: true });
      await fs.mkdir(jobDir,  { recursive: true });

      const specObj = (() => {
        try { return JSON.parse(specContent); } catch { return { raw: specContent }; }
      })();

      await writeJson(path.join(compDir, "linked_job_spec.json"), specObj);
      await writeJson(path.join(jobDir,  "raw_spec.json"),        specObj);

      // Update exec state
      await updateLinkedJobExecState(id, { jobSpecFetched: true });
      log(`Linked job spec fetched for #${id} → job #${linkedJobId}`);
    }

    return specContent;

  } catch (err) {
    log(`fetchLinkedJobSpec error for #${id}: ${err.message}`);
    return null;
  }
}

function unpackMcpResult(result) {
  if (!result) return null;
  if (result.content && Array.isArray(result.content)) {
    for (const item of result.content) {
      if (item.type === "text") {
        try { return JSON.stringify(JSON.parse(item.text), null, 2); } catch { return item.text; }
      }
    }
  }
  return typeof result === "string" ? result : JSON.stringify(result);
}

// ── Update linked job execution state ────────────────────────────────────────

export async function updateLinkedJobExecState(procurementId, patch) {
  const id      = String(procurementId);
  const current = await readJson(
    path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${id}`, "linked_job_execution_state.json"),
    null
  );
  if (!current) return;
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await writeJson(
    path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${id}`, "linked_job_execution_state.json"),
    next
  );
}

// ── Completion handshake ──────────────────────────────────────────────────────

/**
 * Records that the linked job execution is complete and ready for the
 * Prime completion tx.
 *
 * @param {object} opts
 * @param {string|number} opts.procurementId
 * @param {string} opts.completionURI  - ipfs://... pinned completion URI
 */
export async function recordLinkedJobCompletion({ procurementId, completionURI }) {
  const id = String(procurementId);
  const state = await getProcState(id);
  const linkedJobId = state?.linkedJobId;
  if (!linkedJobId) {
    throw new Error(`recordLinkedJobCompletion requires linkedJobId in state for procurement ${id}`);
  }

  const jobArtifacts = getJobArtifactPaths(linkedJobId);
  await validateArtifactShape(
    jobArtifacts.retrievalPacket,
    ARTIFACT_REQUIRED_FIELDS.retrievalPacket,
    "linkedJobRetrievalPacket"
  );
  await validateArtifactShape(
    jobArtifacts.completionArchiveRecord,
    ARTIFACT_REQUIRED_FIELDS.completionArchiveRecord,
    "linkedJobCompletionArchiveRecord"
  );

  await updateLinkedJobExecState(id, {
    phase:            "COMPLETION_READY",
    completionURISet: true,
    completionTxReady: true,
  });

  await setProcState(id, { completionURI });

  if (state?.status === PROC_STATUS.JOB_EXECUTION_IN_PROGRESS) {
    await transitionProcStatus(id, PROC_STATUS.COMPLETION_READY, { completionURI });
  }

  log(`Linked job completion recorded for procurement #${id}, completionURI=${completionURI}`);
}

function log(msg) {
  console.log(`[prime-execution-bridge] ${msg}`);
}
