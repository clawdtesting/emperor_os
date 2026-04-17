import assert from "assert";
import { promises as fs } from "fs";
import path from "path";
import { createArtifactManager } from "../../runtime/artifacts/artifact-manager.js";
import { buildUnsignedEnvelope, assertUnsignedOnly } from "../../runtime/tx/unsigned-envelope.js";

const root = path.join("artifacts", "test_runtime");
await fs.rm(root, { recursive: true, force: true });
const artifacts = createArtifactManager({ artifactRoot: root, protocol: "v1", id: "1" });

let blocked = false;
try {
  await artifacts.requireCanonical();
} catch (err) {
  blocked = true;
  assert.ok(err.details.missing.includes("job_spec.json"));
}
assert.equal(blocked, true, "missing artifacts should block progression");

const unsigned = buildUnsignedEnvelope({ kind: "requestJobCompletion", chainId: 1, to: "0x1", data: "0x8d1bc00f", jobId: "1" });
assert.equal(assertUnsignedOnly(unsigned), true);
assert.throws(() => assertUnsignedOnly({ ...unsigned, signature: "0xdead" }));

console.log("artifact-and-unsigned.test.js passed");
