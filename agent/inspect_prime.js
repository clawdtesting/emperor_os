#!/usr/bin/env node
"use strict";

import { getProtocolConfig } from "./protocol-registry.js";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AGENT_DIR = path.join(__dirname);

async function main() {
  console.log("=== Emperor OS Prime Inspection ===\n");

  const primeCfg = getProtocolConfig("prime");
  console.log("Prime Protocol Configuration:");
  console.log(`  Discovery Contract: ${primeCfg.discoveryContract}`);
  console.log(`  Manager Contract: ${primeCfg.managerContract}`);
  console.log(`  Chain ID: ${primeCfg.chainId}`);
  console.log(`  Contract Name: ${primeCfg.contractName}`);
  console.log();

  // ABI Status
  console.log("ABI Status:");
  const discoveryAbiPath = path.join(AGENT_DIR, "abi", "AGIJobDiscoveryPrime.json");
  let discoveryAbiExists = false;
  try {
    await fs.access(discoveryAbiPath);
    discoveryAbiExists = true;
  } catch (_) {}
  console.log(`  Discovery ABI: ${discoveryAbiExists ? "AVAILABLE" : "MISSING"} at ${discoveryAbiPath}`);
  console.log(`  Manager ABI: NOT AVAILABLE (expected, treated as partial)`);
  console.log();

  // Supported Read-Only Operations (from Discovery ABI)
  console.log("Supported Read-Only Operations (Discovery Contract):");
  if (discoveryAbiExists) {
    const abiContent = await fs.readFile(discoveryAbiPath, "utf8");
    const abiJson = JSON.parse(abiContent);
    const viewFunctions = abiJson.filter(item => item.type === "function" && (item.stateMutability === "view" || item.stateMutability === "pure"));
    if (viewFunctions.length > 0) {
      for (const fn of viewFunctions) {
        console.log(`  - ${fn.name}(${fn.inputs.map(i => `${i.type} ${i.name}`).join(", ")})`);
      }
    } else {
      console.log("  No view/pure functions found in ABI.");
    }
  } else {
    console.log("  Discovery ABI not available; cannot list read-only operations.");
  }
  console.log();

  // Write/Action Operations (from Discovery ABI)
  console.log("Write/Action Operations (Discovery Contract):");
  if (discoveryAbiExists) {
    const abiContent = await fs.readFile(discoveryAbiPath, "utf8");
    const abiJson = JSON.parse(abiContent);
    const writeFunctions = abiJson.filter(item => item.type === "function" && item.stateMutability === "nonpayable");
    if (writeFunctions.length > 0) {
      for (const fn of writeFunctions) {
        console.log(`  - ${fn.name}(${fn.inputs.map(i => `${i.type} ${i.name}`).join(", ")})`);
      }
    } else {
      console.log("  No nonpayable functions found in ABI.");
    }
  } else {
    console.log("  Discovery ABI not available; cannot list write operations.");
  }
  console.log();

  // Safety Warnings
  console.log("Safety Warnings:");
  console.log("  - All write operations require external human signing.");
  console.log("  - No private keys may be used in runtime.");
  console.log("  - Unsigned transaction packages must be generated for write operations.");
  console.log("  - Human review required before signing any transaction.");
  console.log();

  // Multi-dimensional Readiness Assessment
  console.log("Readiness Assessment:");

  // Architecture Readiness: contracts configured
  const architectureReady = !!primeCfg.discoveryContract && !!primeCfg.managerContract;
  console.log(`  Architecture: ${architectureReady ? "architecture_ready" : "architecture_not_ready"}`);

  // Read-Only Readiness: discovery ABI available and we can read view functions
  const readOnlyReady = discoveryAbiExists;
  console.log(`  Read-Only: ${readOnlyReady ? "read_only_partial" : "read_only_not_ready"}`);

  // Unsigned Write Package Readiness: manager ABI available and we have write package builders
  const managerAbiPath = path.join(AGENT_DIR, "abi", "AGIJobPrimeManager.json");
  let managerAbiExists = false;
  try {
    await fs.access(managerAbiPath);
    managerAbiExists = true;
  } catch (_) {}
  const unsignedWriteReady = managerAbiExists; // We don't have manager ABI, so false.
  console.log(`  Unsigned Write Package: ${unsignedWriteReady ? "unsigned_write_ready" : "unsigned_write_not_ready"}`);

  // Live Execution Readiness: state machine integration, monitoring, etc.
  // We don't have Prime state machine integration yet.
  const liveExecutionReady = false; // To be implemented
  console.log(`  Live Prime Execution: ${liveExecutionReady ? "live_prime_ready" : "live_prime_not_ready"}`);

  console.log();

  // Legacy Score (for reference only)
  let legacyScore = 0;
  const legacyTotal = 4;
  if (primeCfg.discoveryContract && primeCfg.managerContract) legacyScore++;
  if (discoveryAbiExists) legacyScore++;
  const primeFiles = [
    "prime-artifact-builder.js", "prime-client.js", "prime-content.js",
    "prime-execution-bridge.js", "prime-inspector.js", "prime-monitor.js",
    "prime-next-action.js", "prime-orchestrator.js", "prime-phase-model.js",
    "prime-presign-checks.js", "prime-receipts.js", "prime-reconciliation.js",
    "prime-retrieval.js", "prime-review-gates.js", "prime-settlement.js",
    "prime-state.js", "prime-tx-builder.js", "prime-tx-validator.js",
    "prime-validator-engine.js", "prime-validator-scoring.js"
  ];
  let foundCount = 0;
  for (const file of primeFiles) {
    const fullPath = path.join(AGENT_DIR, file);
    try {
      await fs.access(fullPath);
      foundCount++;
    } catch (_) {}
  }
  const fileScore = foundCount >= primeFiles.length * 0.5 ? 1 : 0;
  legacyScore += fileScore;
  const stateFiles = ["prime-state.js", "prime-phase-model.js"];
  let stateCount = 0;
  for (const file of stateFiles) {
    try {
      await fs.access(path.join(AGENT_DIR, file));
      stateCount++;
    } catch (_) {}
  }
  const stateScore = stateCount > 0 ? 1 : 0;
  legacyScore += stateScore;
  console.log(`Legacy Readiness Score: ${legacyScore}/${legacyTotal} (for reference only)`);
  console.log();

  console.log("=== Inspection Complete ===");
}

main().catch((err) => {
  console.error("[inspect_prime] Error:", err.message || err);
  process.exit(1);
});