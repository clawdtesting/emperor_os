import { encodePrimeCall } from "./prime-client.js";
import { promises as fs } from "fs";
import path from "path";

const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);

async function test() {
  const procurementId = 1001;
  const artifactDir = path.join(__dirname, "..", "artifacts", `proc_${procurementId}`);
  const commitmentPath = path.join(artifactDir, "application", "commitment_material.json");
  const commitmentData = JSON.parse(await fs.readFile(commitmentPath, "utf8"));
  console.log("commitmentData:", commitmentData);

  // Now try to encode revealApplication
  const revealArgs = [
    BigInt(procurementId),
    commitmentData.agentSubdomain,
    commitmentData.merkleProof,
    commitmentData.salt,
    "ipfs://bafybeigdyrzt5wfp7ud7aghu7q4tfy5t3sa6rllghx62e6n2qgz6fudaaq/application.md" // dummy
  ];

  try {
    const { to, data } = encodePrimeCall("revealApplication", revealArgs);
    console.log("Success! to:", to, "data:", data);
  } catch (e) {
    console.error("Error encoding revealApplication:", e.message);
    console.error("e:", e);
  }
}

test().catch(console.error);