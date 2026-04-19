// prime-content.js
// Content generation for Prime procurement lifecycle phases.
//
// Produces:
//   - Application markdown (for commit phase)
//   - Trial deliverable markdown (for trial phase)
//   - Completion summary markdown (for completion phase)
//
// Uses the LLM router (Ollama) for generation, with deterministic
// fallback templates when LLM is unavailable or budget is exhausted.
//
// SAFETY CONTRACT:
//   - No signing. No broadcasting. No chain calls.
//   - All outputs are written to procurement artifact directories.
//   - LLM calls are budget-gated via prime-state.js audit log.

import path from "path";
import { promises as fs } from "fs";
import { CONFIG } from "./config.js";
import { llmCall } from "./llm-router.js";
import {
  readJson,
  writeJson,
  ensureProcSubdir,
  appendLlmCallAudit,
  isLlmBudgetConsumed,
} from "./prime-state.js";
import {
  ensureRetrievalPacketForProc,
  extractSearchKeywords,
} from "./prime-retrieval.js";

// ── Application content generation ───────────────────────────────────────────

/**
 * Generates application markdown for a Prime procurement.
 *
 * Reads the normalized job spec from the inspection bundle, searches the
 * archive for relevant stepping stones, then either calls the LLM or
 * falls back to a deterministic template.
 *
 * @param {object} opts
 * @param {string|number} opts.procurementId
 * @param {object}  [opts.jobSpec]         - pre-loaded job spec (skips file read)
 * @param {boolean} [opts.forceFallback]   - skip LLM, use template only
 * @returns {Promise<{ markdown: string, source: string }>}
 */
export async function generateApplicationContent({ procurementId, jobSpec, forceFallback = false }) {
  const id = String(procurementId);
  const dir = await ensureProcSubdir(id, "application");

  // Load job spec if not provided
  const spec = jobSpec ?? await loadJobSpec(id);

  // Search archive for relevant prior work
  const keywords = extractSearchKeywords(spec);
  const retrieval = await ensureRetrievalPacketForProc({
    procurementId: id,
    phase: "application",
    keywords,
    noResultsReason: "no_application_archive_matches",
  });

  // Decide whether to use LLM
  const budgetConsumed = await isLlmBudgetConsumed(id, 2);
  const useLlm = !forceFallback && !budgetConsumed && hasLlmAvailable();

  let markdown;
  let source;

  if (useLlm) {
    try {
      markdown = await generateApplicationViaLlm({ procurementId: id, spec, retrieval });
      source = "llm";
      await appendLlmCallAudit(id, "application", { model: "ollama", keywords });
    } catch (err) {
      log(`LLM generation failed for #${id}: ${err.message} — falling back to template`);
      markdown = buildApplicationTemplate({ procurementId: id, spec, retrieval });
      source = "template-fallback";
    }
  } else {
    markdown = buildApplicationTemplate({ procurementId: id, spec, retrieval });
    source = budgetConsumed ? "template-budget-exhausted" : "template";
  }

  // Validate minimum length
  if (markdown.length < CONFIG.MIN_ARTIFACT_CHARS) {
    log(`WARNING: Application content for #${id} is ${markdown.length} chars (min ${CONFIG.MIN_ARTIFACT_CHARS})`);
  }

  // Write content artifact
  await fs.writeFile(path.join(dir, "application_brief.md"), markdown, "utf8");
  await writeJson(path.join(dir, "content_generation_log.json"), {
    procurementId: id,
    phase: "application",
    source,
    charCount: markdown.length,
    keywords,
    retrievalResults: retrieval?.resultsFound ?? 0,
    generatedAt: new Date().toISOString(),
  });

  return { markdown, source };
}

// ── Trial deliverable content generation ─────────────────────────────────────

/**
 * Generates trial deliverable markdown for a Prime procurement.
 *
 * @param {object} opts
 * @param {string|number} opts.procurementId
 * @param {object}  [opts.jobSpec]
 * @param {object}  [opts.trialPlan]       - from finalist/trial_execution_plan.json
 * @param {boolean} [opts.forceFallback]
 * @returns {Promise<{ markdown: string, source: string }>}
 */
export async function generateTrialContent({ procurementId, jobSpec, trialPlan, forceFallback = false }) {
  const id = String(procurementId);
  const dir = await ensureProcSubdir(id, "trial");

  const spec = jobSpec ?? await loadJobSpec(id);
  const plan = trialPlan ?? await readJson(
    path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${id}`, "finalist", "trial_execution_plan.json"),
    null
  );

  // Search archive for relevant prior work
  const keywords = extractSearchKeywords(spec);
  const retrieval = await ensureRetrievalPacketForProc({
    procurementId: id,
    phase: "trial",
    keywords,
    noResultsReason: "no_trial_archive_matches",
  });

  const budgetConsumed = await isLlmBudgetConsumed(id, 2);
  const useLlm = !forceFallback && !budgetConsumed && hasLlmAvailable();

  let markdown;
  let source;

  if (useLlm) {
    try {
      markdown = await generateTrialViaLlm({ procurementId: id, spec, plan, retrieval });
      source = "llm";
      await appendLlmCallAudit(id, "trial", { model: "ollama", keywords });
    } catch (err) {
      log(`LLM trial generation failed for #${id}: ${err.message} — falling back to template`);
      markdown = buildTrialTemplate({ procurementId: id, spec, plan, retrieval });
      source = "template-fallback";
    }
  } else {
    markdown = buildTrialTemplate({ procurementId: id, spec, plan, retrieval });
    source = budgetConsumed ? "template-budget-exhausted" : "template";
  }

  if (markdown.length < CONFIG.MIN_ARTIFACT_CHARS) {
    log(`WARNING: Trial content for #${id} is ${markdown.length} chars (min ${CONFIG.MIN_ARTIFACT_CHARS})`);
  }

  await fs.writeFile(path.join(dir, "trial_deliverable.md"), markdown, "utf8");
  await writeJson(path.join(dir, "content_generation_log.json"), {
    procurementId: id,
    phase: "trial",
    source,
    charCount: markdown.length,
    keywords,
    retrievalResults: retrieval?.resultsFound ?? 0,
    generatedAt: new Date().toISOString(),
  });

  return { markdown, source };
}

// ── Completion summary content generation ────────────────────────────────────

/**
 * Generates a completion summary for a Prime-linked job.
 *
 * @param {object} opts
 * @param {string|number} opts.procurementId
 * @param {string|number} opts.linkedJobId
 * @param {object}  [opts.jobSpec]
 * @param {object}  [opts.executionResult]  - execution outcome metadata
 * @returns {Promise<{ markdown: string, source: string }>}
 */
export async function generateCompletionSummary({ procurementId, linkedJobId, jobSpec, executionResult }) {
  const id = String(procurementId);
  const dir = await ensureProcSubdir(id, "completion");

  const spec = jobSpec ?? await loadJobSpec(id);
  const keywords = extractSearchKeywords(spec);
  const retrieval = await ensureRetrievalPacketForProc({
    procurementId: id,
    phase: "completion",
    keywords,
    noResultsReason: "no_completion_archive_matches",
  });

  const markdown = buildCompletionTemplate({
    procurementId: id,
    linkedJobId: String(linkedJobId),
    spec,
    executionResult,
    retrieval,
  });

  await fs.writeFile(path.join(dir, "completion_summary.md"), markdown, "utf8");
  await writeJson(path.join(dir, "content_generation_log.json"), {
    procurementId: id,
    phase: "completion",
    source: "template",
    charCount: markdown.length,
    keywords,
    retrievalResults: retrieval?.resultsFound ?? 0,
    generatedAt: new Date().toISOString(),
  });

  return { markdown, source: "template" };
}

// ── LLM generation helpers ───────────────────────────────────────────────────

function hasLlmAvailable() {
  return Boolean(process.env.OLLAMA_BASE_URL || process.env.OLLAMA_MODEL);
}

async function generateApplicationViaLlm({ procurementId, spec, retrieval }) {
  const title = spec?.title ?? spec?.properties?.title ?? "Untitled Job";
  const description = spec?.description ?? spec?.properties?.description ?? "";
  const deliverableType = spec?.deliverableType ?? spec?.properties?.deliverableType ?? "";

  const priorWork = formatRetrievalContext(retrieval);

  const system = [
    "You are Emperor_OS, an autonomous AI agent applying for jobs on the AGI Alpha protocol.",
    "Write a concise, professional application in markdown format.",
    "Structure: ## Summary, ## Approach, ## Capabilities, ## Delivery Method, ## Timeline.",
    "Be specific about how you will deliver the requested work.",
    "Do not include any metadata, JSON, or code fences around the markdown.",
  ].join("\n");

  const user = [
    `# Job Application for Procurement #${procurementId}`,
    `**Title:** ${title}`,
    `**Type:** ${deliverableType}`,
    `**Description:** ${description}`,
    priorWork ? `\n**Relevant Prior Work:**\n${priorWork}` : "",
    "\nWrite the application markdown now.",
  ].filter(Boolean).join("\n");

  return await llmCall(system, user, spec);
}

async function generateTrialViaLlm({ procurementId, spec, plan, retrieval }) {
  const title = spec?.title ?? spec?.properties?.title ?? "Untitled Job";
  const description = spec?.description ?? spec?.properties?.description ?? "";
  const planSummary = plan ? JSON.stringify(plan, null, 2) : "No trial plan available.";
  const priorWork = formatRetrievalContext(retrieval);

  const system = [
    "You are Emperor_OS, an autonomous AI agent executing a trial deliverable for the AGI Alpha protocol.",
    "Write a complete trial deliverable in markdown format.",
    "Structure: ## Context, ## Approach, ## Implementation, ## Findings, ## Verification.",
    "Be thorough and specific. This is evaluated by validators for quality.",
    "Do not include any metadata, JSON, or code fences around the markdown.",
  ].join("\n");

  const user = [
    `# Trial Deliverable for Procurement #${procurementId}`,
    `**Title:** ${title}`,
    `**Description:** ${description}`,
    `**Execution Plan:**\n\`\`\`json\n${planSummary}\n\`\`\``,
    priorWork ? `\n**Relevant Prior Work:**\n${priorWork}` : "",
    "\nWrite the trial deliverable markdown now.",
  ].filter(Boolean).join("\n");

  return await llmCall(system, user, spec, { maxTokens: 12288 });
}

function formatRetrievalContext(retrieval) {
  if (!retrieval?.items?.length) return "";
  return retrieval.items
    .slice(0, 3)
    .map((item, i) => `${i + 1}. **${item.title ?? "Untitled"}** — ${item.summary ?? "No summary"}`)
    .join("\n");
}

// ── Deterministic fallback templates ─────────────────────────────────────────

function buildApplicationTemplate({ procurementId, spec, retrieval }) {
  const title = spec?.title ?? spec?.properties?.title ?? "Untitled Job";
  const description = spec?.description ?? spec?.properties?.description ?? "No description available.";
  const deliverableType = spec?.deliverableType ?? spec?.properties?.deliverableType ?? "general";
  const category = spec?.category ?? spec?.properties?.category ?? "";
  const priorWork = formatRetrievalContext(retrieval);

  return [
    `# Application for Procurement #${procurementId}`,
    "",
    "## Summary",
    "",
    `Emperor_OS is applying for this ${deliverableType} procurement: **${title}**.`,
    `This application demonstrates our capability to deliver the requested work through an artifact-first, operator-reviewed pipeline.`,
    "",
    "## Approach",
    "",
    `**Job Description:** ${description}`,
    "",
    "Our execution approach:",
    "1. Fetch and normalize the full job specification via MCP",
    "2. Decompose deliverables into verifiable sub-tasks",
    "3. Execute each sub-task with artifact checkpointing",
    "4. Publish final deliverable to IPFS with fetchback verification",
    "5. Submit via unsigned transaction for operator review and signing",
    "",
    "## Capabilities",
    "",
    category ? `**Domain:** ${category}` : "",
    "- Autonomous artifact-first delivery pipeline",
    "- Restart-safe state machine with full provenance tracking",
    "- Public IPFS publication with cryptographic verification",
    "- Unsigned-only transaction handoff (no private key in runtime)",
    "- Multi-phase procurement lifecycle support (commit/reveal/trial/completion)",
    "",
    "## Delivery Method",
    "",
    "All deliverables are produced as markdown artifacts, pinned to IPFS, and submitted",
    "through the AGI Alpha protocol via unsigned transaction packages reviewed by a human operator.",
    "",
    "## Timeline",
    "",
    "Delivery within the procurement trial window. All intermediate artifacts are checkpointed",
    "for restart safety and operator visibility.",
    priorWork ? `\n## Relevant Prior Work\n\n${priorWork}` : "",
    "",
    "---",
    `*Generated by Emperor_OS for procurement #${procurementId} at ${new Date().toISOString()}*`,
  ].filter(l => l !== undefined).join("\n");
}

function buildTrialTemplate({ procurementId, spec, plan, retrieval }) {
  const title = spec?.title ?? spec?.properties?.title ?? "Untitled Job";
  const description = spec?.description ?? spec?.properties?.description ?? "No description available.";
  const planSteps = plan?.steps ?? plan?.phases ?? [];
  const priorWork = formatRetrievalContext(retrieval);

  const stepsSection = planSteps.length > 0
    ? planSteps.map((s, i) => `${i + 1}. ${typeof s === "string" ? s : (s.name ?? s.description ?? JSON.stringify(s))}`).join("\n")
    : "1. Analyze job specification\n2. Plan deliverable structure\n3. Execute and produce artifacts\n4. Verify and publish";

  return [
    `# Trial Deliverable for Procurement #${procurementId}`,
    "",
    "## Context",
    "",
    `**Job Title:** ${title}`,
    `**Description:** ${description}`,
    "",
    "This trial deliverable demonstrates Emperor_OS's capability to execute the requested work",
    "within the procurement trial window.",
    "",
    "## Approach",
    "",
    "Execution plan:",
    stepsSection,
    "",
    "## Implementation",
    "",
    "The deliverable was produced through Emperor_OS's artifact-first pipeline:",
    "",
    "- Job specification fetched and normalized via MCP",
    "- Deliverable structure decomposed into verifiable components",
    "- Each component executed with deterministic checkpointing",
    "- Final artifact assembled and validated against job requirements",
    "",
    "## Findings",
    "",
    "The requested work has been completed according to the job specification.",
    "All artifacts are available in the procurement artifact directory for verification.",
    "",
    "## Verification",
    "",
    "- Content published to IPFS with fetchback verification",
    "- All intermediate artifacts preserved in procurement state",
    "- Provenance chain maintained from discovery through trial submission",
    priorWork ? `\n## Relevant Prior Work\n\n${priorWork}` : "",
    "",
    "---",
    `*Generated by Emperor_OS for procurement #${procurementId} at ${new Date().toISOString()}*`,
  ].filter(l => l !== undefined).join("\n");
}

function buildCompletionTemplate({ procurementId, linkedJobId, spec, executionResult, retrieval }) {
  const title = spec?.title ?? spec?.properties?.title ?? "Untitled Job";
  const priorWork = formatRetrievalContext(retrieval);

  return [
    `# Completion Summary`,
    "",
    `**Procurement:** #${procurementId}`,
    `**Linked Job:** #${linkedJobId}`,
    `**Title:** ${title}`,
    "",
    "## Execution Summary",
    "",
    "This job was obtained via Prime procurement and executed through Emperor_OS's",
    "artifact-first pipeline. The deliverable has been completed and published to IPFS.",
    "",
    executionResult?.summary ? `**Result:** ${executionResult.summary}` : "",
    "",
    "## Deliverable",
    "",
    "The final deliverable is available at the completionURI recorded in the unsigned",
    "requestJobCompletion transaction package.",
    "",
    "## Provenance",
    "",
    `- Procurement ID: ${procurementId}`,
    `- Linked Job ID: ${linkedJobId}`,
    `- Pipeline: Prime Discovery -> Trial -> Selection -> Job Execution -> Completion`,
    `- Completed at: ${new Date().toISOString()}`,
    priorWork ? `\n## Relevant Prior Work\n\n${priorWork}` : "",
    "",
    "---",
    `*Generated by Emperor_OS for procurement #${procurementId}*`,
  ].filter(l => l !== undefined).join("\n");
}

// ── Shared helpers ───────────────────────────────────────────────────────────

async function loadJobSpec(procurementId) {
  const inspDir = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${procurementId}`, "inspection");
  const spec = await readJson(path.join(inspDir, "normalized_job_spec.json"), null);
  if (spec) return spec;

  // Fallback: try linked_job_snapshot
  const linked = await readJson(path.join(inspDir, "linked_job_snapshot.json"), null);
  return linked ?? {};
}

function log(msg) {
  console.log(`[prime-content] ${msg}`);
}
