import { promises as fs } from "fs";
import path from "path";

const CANONICAL_ARTIFACTS = [
  "job_spec.json",
  "retrieval_packet.json",
  "decomposition_plan.json",
  "execution_trace.jsonl",
  "findings.json",
  "validator_packet.json",
  "completion_manifest.json",
  "repro_envelope.json",
  "archive_index_record.json",
  "metrics_record.json"
];

class MissingArtifactsError extends Error {
  constructor(missing) {
    super(`Canonical artifact bundle incomplete: missing ${missing.join(", ")}`);
    this.name = "MissingArtifactsError";
    this.details = { missing };
  }
}

export function createArtifactManager({ artifactRoot = "artifacts", protocol = "v1", id = "runtime" } = {}) {
  const baseDir = path.join(String(artifactRoot), `${protocol}_${id}`);

  async function ensureDir() {
    await fs.mkdir(baseDir, { recursive: true });
  }

  async function writeJson(name, data) {
    await ensureDir();
    const tmp = path.join(baseDir, `${name}.tmp.${Date.now()}`);
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(tmp, path.join(baseDir, name));
  }

  async function writeText(name, content) {
    await ensureDir();
    await fs.appendFile(path.join(baseDir, name), content, "utf8");
  }

  async function exists(name) {
    try {
      await fs.access(path.join(baseDir, name));
      return true;
    } catch {
      return false;
    }
  }

  async function requireCanonical() {
    const missing = [];
    for (const name of CANONICAL_ARTIFACTS) {
      if (!(await exists(name))) missing.push(name);
    }
    if (missing.length > 0) throw new MissingArtifactsError(missing);
  }

  async function list() {
    try {
      return await fs.readdir(baseDir);
    } catch {
      return [];
    }
  }

  return { baseDir, writeJson, writeText, exists, requireCanonical, list };
}
