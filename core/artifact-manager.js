// /home/ubuntu/emperor_OS/.openclaw/workspace/agent/artifact-manager.js
import { promises as fs } from "fs";
import path from "path";
import { CONFIG } from "./config.js";

export const ARTIFACTS_ROOT = path.join(CONFIG.WORKSPACE_ROOT, "artifacts");
export const DEBUG_ROOT = path.join(CONFIG.WORKSPACE_ROOT, "debug");

export function getJobArtifactDir(jobId) {
  return path.join(ARTIFACTS_ROOT, `job_${jobId}`);
}

export async function ensureWorkspaceArtifactDirs() {
  await fs.mkdir(ARTIFACTS_ROOT, { recursive: true });
  await fs.mkdir(DEBUG_ROOT, { recursive: true });
}

export function getJobArtifactPaths(jobId) {
  const dir = getJobArtifactDir(jobId);

  return {
    dir,
    rawSpec: path.join(dir, "raw_spec.json"),
    normalizedSpec: path.join(dir, "normalized_spec.json"),
    strategy: path.join(dir, "strategy.json"),
    brief: path.join(dir, "brief.json"),
    retrievalPacket: path.join(dir, "retrieval_packet_execution.json"),
    deliverable: path.join(dir, "deliverable.md"),
    validation: path.join(dir, "validation.json"),
    publishManifest: path.join(dir, "publish_manifest.json"),
    jobCompletion: path.join(dir, "job_completion.json"),
    unsignedApply: path.join(dir, "unsigned_apply.json"),
    unsignedCompletion: path.join(dir, "unsigned_completion.json")
  };
}

export async function ensureJobArtifactDir(jobId) {
  const dir = getJobArtifactDir(jobId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function writeJson(filePath, data) {
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, filePath);
}

export async function writeText(filePath, text) {
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, text, "utf8");
  await fs.rename(tmp, filePath);
}

export async function readText(filePath) {
  return fs.readFile(filePath, "utf8");
}
