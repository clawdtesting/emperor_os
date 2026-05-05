#!/usr/bin/env node
"use strict";

import { getProtocolConfig } from "./protocol-registry.js";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AGENT_DIR = path.join(__dirname);
const DOCS_DIR = path.join(__dirname, "..", "docs");

async function main() {
  console.log("=== Emperor OS Prime Readiness Audit ===\n");

  // 1. Protocol Registry Check
  const primeCfg = getProtocolConfig("prime");
  console.log("1. Prime Protocol Configuration:");
  console.log(`   Discovery Contract: ${primeCfg.discoveryContract}`);
  console.log(`   Manager Contract: ${primeCfg.managerContract}`);
  console.log(`   Chain ID: ${primeCfg.chainId}`);
  console.log(`   Contract Name: ${primeCfg.contractName}`);
  console.log(`   ABI Status:`);
  console.log(`     Discovery: ${primeCfg.abi.discovery.status} (${primeCfg.abi.discovery.sourcePath ? "available" : "missing"})`);
  console.log(`     Manager: ${primeCfg.abi.manager.status} (${primeCfg.abi.manager.sourcePath ? "available" : "missing"})`);
  console.log();

  // 2. Check for ABI files
  const discoveryAbiPath = path.join(AGENT_DIR, "abi", "AGIJobDiscoveryPrime.json");
  const managerAbiPath = path.join(AGENT_DIR, "abi", "AGIJobPrimeManager.json"); // Assuming we might have this or not
  let discoveryAbiExists = false;
  let managerAbiExists = false;
  try {
    await fs.access(discoveryAbiPath);
    discoveryAbiExists = true;
  } catch (_) {}
  try {
    await fs.access(managerAbiPath);
    managerAbiExists = true;
  } catch (_) {}
  console.log("2. Local ABI Files:");
  console.log(`   Discovery ABI: ${discoveryAbiExists ? "FOUND" : "MISSING"} at ${discoveryAbiPath}`);
  console.log(`   Manager ABI: ${managerAbiExists ? "FOUND" : "MISSING"} (expected, not required for read-only)`);
  console.log();

  // 3. List Prime-related agent files
  const primeFiles = [
    "prime-artifact-builder.js",
    "prime-client.js",
    "prime-content.js",
    "prime-execution-bridge.js",
    "prime-inspector.js",
    "prime-monitor.js",
    "prime-next-action.js",
    "prime-orchestrator.js",
    "prime-phase-model.js",
    "prime-presign-checks.js",
    "prime-receipts.js",
    "prime-reconciliation.js",
    "prime-retrieval.js",
    "prime-review-gates.js",
    "prime-settlement.js",
    "prime-state.js",
    "prime-tx-builder.js",
    "prime-tx-validator.js",
    "prime-validator-engine.js",
    "prime-validator-scoring.js"
  ];
  console.log("3. Prime-related Agent Files (found in agent/):");
  let foundCount = 0;
  for (const file of primeFiles) {
    const fullPath = path.join(AGENT_DIR, file);
    try {
      await fs.access(fullPath);
      console.log(`   ✓ ${file}`);
      foundCount++;
    } catch (_) {
      console.log(`   ✗ ${file} (missing)`);
    }
  }
  console.log(`   Total: ${foundCount}/${primeFiles.length} files present\n`);

  // 4. Determine supported actions from ABI (discovery)
  console.log("4. Prime Discovery ABI - Available Functions (read/write):");
  if (discoveryAbiExists) {
    const abiContent = await fs.readFile(discoveryAbiPath, "utf8");
    const abiJson = JSON.parse(abiContent);
    const functions = abiJson.filter(item => item.type === "function");
    const events = abiJson.filter(item => item.type === "event");
    console.log(`   Functions: ${functions.length}`);
    for (const fn of functions) {
      const mutability = fn.stateMutability;
      const isView = mutability === "view" || mutability === "pure";
      console.log(`     - ${fn.name}(${fn.inputs.map(i => `${i.type} ${i.name}`).join(", ")})`);
      console.log(`       State: ${mutability} ${isView ? "(READ-ONLY)" : "(WRITES)"}`);
    }
    console.log(`   Events: ${events.length}`);
    for (const ev of events) {
      console.log(`     - ${ev.name}`);
    }
  } else {
    console.log("   Discovery ABI not available; cannot list functions.");
  }
  console.log();

  // 5. Check for existing Prime state or flow files
  console.log("5. Prime State/Model Files:");
  const stateFiles = ["prime-state.js", "prime-phase-model.js"];
  for (const file of stateFiles) {
    const fullPath = path.join(AGENT_DIR, file);
    try {
      await fs.access(fullPath);
      console.log(`   ✓ ${file} - exists`);
    } catch (_) {
      console.log(`   ✗ ${file} - missing`);
    }
  }
  console.log();

  // 6. Readiness Score (simple)
  let score = 0;
  const total = 5;
  if (primeCfg.discoveryContract && primeCfg.managerContract) score++;
  if (discoveryAbiExists) score++;
  if (foundCount >= primeFiles.length * 0.8) score++; // 80% of prime files present
  // Check for state/model files
  let stateCount = 0;
  for (const file of stateFiles) {
    try {
      await fs.access(path.join(AGENT_DIR, file));
      stateCount++;
    } catch (_) {}
  }
  if (stateCount > 0) score++;
  // Check if we have at least some Prime flow logic (we do, many files)
  if (foundCount > 10) score++;
  console.log(`6. Prime Readiness Score: ${score}/${total}`);
  console.log(`   Breakdown:`);
  console.log(`     - Contracts configured: ${primeCfg.discoveryContract && primeCfg.managerContract ? "YES" : "NO"}`);
  console.log(`     - Discovery ABI available: ${discoveryAbiExists ? "YES" : "NO"}`);
  console.log(`     - Prime agent files present: ${foundCount}/${primeFiles.length} (${Math.round(foundCount/primeFiles.length*100)}%)`);
  console.log(`     - State/model files present: ${stateCount > 0 ? "YES" : "NO"}`);
  console.log(`     - Substantial Prime logic present: ${foundCount > 10 ? "YES" : "NO"}`);
  console.log();

  // 7. Missing Capabilities
  console.log("7. Missing Prime Capabilities (to be implemented):");
  console.log("   - Prime-specific job discovery flow (commit/reveal applications)");
  console.log("   - Prime finalist acceptance and trial submission");
  console.log("   - Prime validator scoring and reward distribution");
  console.log("   - Prime settlement and fund allocation");
  console.log("   - Integration of Prime flows into Emperor OS state machine");
  console.log("   - Unsigned transaction packaging for Prime write actions");
  console.log("   - Validator action packages for Prime scoring/settlement");
  console.log();

  // 8. Safety Notes
  console.log("8. Safety Gates Required for Prime:");
  console.log("   - All Prime write actions (commit, reveal, accept finalist, submit trial, score, settle) must require external human signing.");
  console.log("   - No private keys may exist in runtime; unsigned tx packages only.");
  console.log("   - Human review required before signing any Prime transaction.");
  console.log("   - Prime read-only functions (view/pure) can be called freely for data retrieval.");
  console.log();

  console.log("=== Audit Complete ===");
}

main().catch((err) => {
  console.error("[prime-readiness-audit] Error:", err.message || err);
  process.exit(1);
});