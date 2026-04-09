import { promises as fs } from "fs";
import path from "path";
import { CONFIG } from "../config.js";

const EXECUTION_STAGES = Object.freeze([
  "discover",
  "normalize",
  "classify",
  "tier_selection",
  "economic_check",
  "apply_decision",
  "apply",
  "execute_pass_1",
  "validate",
  "finalize",
  "submit"
]);

const STAGE_TRANSITIONS = Object.freeze({
  discover: ["normalize"],
  normalize: ["classify"],
  classify: ["tier_selection"],
  tier_selection: ["economic_check"],
  economic_check: ["apply_decision"],
  apply_decision: ["apply"],
  apply: ["execute_pass_1"],
  execute_pass_1: ["validate"],
  validate: ["finalize"],
  finalize: ["submit"],
  submit: []
});

const REQUIRED_STAGE_ARTIFACTS = Object.freeze({
  tier_selection: ["tier_selection.json"],
  economic_check: ["economic_check.json"],
  apply_decision: ["apply_decision.json"],
  validate: ["validation.json"],
  finalize: ["repair_logs.json"]
});

function executionRoot(jobId) {
  return path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `job_${jobId}`, "execution-tier");
}

function stateFile(jobId) {
  return path.join(executionRoot(jobId), "execution_state.json");
}

async function atomicWriteJson(filePath, data) {
  const tmp = `${filePath}.tmp.${Date.now()}.${Math.random().toString(16).slice(2, 8)}`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, filePath);
}

async function readJson(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function ensureExecutionTierDirs(jobId) {
  const root = executionRoot(jobId);
  await fs.mkdir(path.join(root, "passes"), { recursive: true });
  return root;
}

export async function initExecutionState(jobId, metadata = {}) {
  await ensureExecutionTierDirs(jobId);
  const initial = {
    jobId: String(jobId),
    currentStage: "discover",
    stageHistory: [
      {
        stage: "discover",
        at: new Date().toISOString()
      }
    ],
    metadata
  };

  await atomicWriteJson(stateFile(jobId), initial);
  return initial;
}

export async function loadExecutionState(jobId) {
  const loaded = await readJson(stateFile(jobId), null);
  if (loaded) {
    return loaded;
  }

  return initExecutionState(jobId);
}

function assertTransitionAllowed(currentStage, nextStage) {
  if (!EXECUTION_STAGES.includes(currentStage) || !EXECUTION_STAGES.includes(nextStage)) {
    throw new Error(`unknown_stage_transition:${currentStage}->${nextStage}`);
  }

  const allowed = STAGE_TRANSITIONS[currentStage] ?? [];
  if (!allowed.includes(nextStage)) {
    throw new Error(`invalid_stage_transition:${currentStage}->${nextStage}`);
  }
}

function assertNoAutoSigning(payload) {
  const json = JSON.stringify(payload ?? {}).toLowerCase();
  const forbiddenFragments = ["privatekey", "signedtx", "sendrawtransaction", "signtransaction"];
  for (const fragment of forbiddenFragments) {
    if (json.includes(fragment)) {
      throw new Error(`signing_boundary_violation:${fragment}`);
    }
  }
}

function validateArtifactShape(fileName, content) {
  if (fileName === "tier_selection.json") {
    const required = ["selectedTier", "complexityFeatures", "economicCheck", "reasoning"];
    for (const key of required) {
      if (!(key in (content ?? {}))) {
        throw new Error(`invalid_artifact_schema:tier_selection.json:${key}`);
      }
    }
  }

  if (fileName === "validation.json") {
    if (typeof content?.passed !== "boolean") {
      throw new Error("invalid_artifact_schema:validation.json:passed");
    }
  }
}

export async function writeStageArtifact(jobId, fileName, content) {
  await ensureExecutionTierDirs(jobId);
  assertNoAutoSigning(content);
  validateArtifactShape(fileName, content);

  const artifactPath = path.join(executionRoot(jobId), fileName);
  await atomicWriteJson(artifactPath, content);
  return artifactPath;
}

async function assertRequiredArtifactsPresent(jobId, stage) {
  const required = REQUIRED_STAGE_ARTIFACTS[stage] ?? [];
  for (const fileName of required) {
    const filePath = path.join(executionRoot(jobId), fileName);
    const exists = await readJson(filePath, null);
    if (!exists) {
      throw new Error(`missing_required_artifact:${stage}:${fileName}`);
    }

    validateArtifactShape(fileName, exists);
  }

  return true;
}

export async function advanceExecutionStage(jobId, nextStage, context = {}) {
  const state = await loadExecutionState(jobId);
  assertTransitionAllowed(state.currentStage, nextStage);

  await assertRequiredArtifactsPresent(jobId, nextStage);

  const nextState = {
    ...state,
    currentStage: nextStage,
    stageHistory: [
      ...state.stageHistory,
      {
        stage: nextStage,
        at: new Date().toISOString(),
        context
      }
    ]
  };

  await atomicWriteJson(stateFile(jobId), nextState);
  return nextState;
}

export async function writeExecutionPass(jobId, passIndex, payload) {
  await ensureExecutionTierDirs(jobId);
  assertNoAutoSigning(payload);

  const filePath = path.join(executionRoot(jobId), "passes", `pass_${passIndex}.json`);
  await atomicWriteJson(filePath, payload);
  return filePath;
}

export function getExecutionTierPaths(jobId) {
  return {
    root: executionRoot(jobId),
    state: stateFile(jobId),
    tierSelection: path.join(executionRoot(jobId), "tier_selection.json"),
    economicCheck: path.join(executionRoot(jobId), "economic_check.json"),
    applyDecision: path.join(executionRoot(jobId), "apply_decision.json"),
    validation: path.join(executionRoot(jobId), "validation.json"),
    repairLogs: path.join(executionRoot(jobId), "repair_logs.json")
  };
}
