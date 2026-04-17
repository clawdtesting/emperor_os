import assert from "assert";
import { promises as fs } from "fs";
import path from "path";
import { runRuntimeItem } from "../../app/runner.js";

const tmpState = path.join(".tmp", "protocol-runtime", "state");
const tmpArtifacts = path.join(".tmp", "protocol-runtime", "artifacts");
await fs.rm(path.join(".tmp", "protocol-runtime"), { recursive: true, force: true });

// Seed canonical artifacts required by submission gate.
const artifactDir = path.join(tmpArtifacts, "v1_42");
await fs.mkdir(artifactDir, { recursive: true });
for (const name of [
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
]) {
  await fs.writeFile(path.join(artifactDir, name), name.endsWith(".json") ? "{}" : "\n", "utf8");
}

let status = "DISCOVERED";
for (let i = 0; i < 12; i += 1) {
  const state = await runRuntimeItem({ protocol: "v1", jobId: "42", initialStatus: status, stateDir: tmpState, artifactRoot: tmpArtifacts, chainId: 1, contract: "0x1" });
  status = state.status;
  if (status === "DONE") break;
}

const final = await runRuntimeItem({ protocol: "v1", jobId: "42", initialStatus: status, stateDir: tmpState, artifactRoot: tmpArtifacts, chainId: 1, contract: "0x1" });
assert.equal(final.status, "DONE");
console.log("pipeline-progression.test.js passed");
