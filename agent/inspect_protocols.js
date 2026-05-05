#!/usr/bin/env node
"use strict";

import { PROTOCOL_REGISTRY, getProtocolWarnings, isAbiFileAvailable } from "./protocol-registry.js";

async function main() {
  for (const [key, cfg] of Object.entries(PROTOCOL_REGISTRY)) {
    const abiExists = await isAbiFileAvailable(key);
    const warnings = getProtocolWarnings(cfg);
    if (!abiExists) warnings.push(`ABI file missing at ${cfg.abi.sourcePath}`);

    console.log(`protocol: ${cfg.protocol}`);
    console.log(`  contractAddress: ${cfg.contractAddress || "unknown"}`);
    if (cfg.managerContractAddress) console.log(`  managerContractAddress: ${cfg.managerContractAddress}`);
    console.log(`  chainId: ${cfg.chainId}`);
    console.log(`  contractName: ${cfg.contractName}`);
    console.log(`  abiStatus: ${cfg.abi.status}${abiExists ? "" : " (file-missing)"}`);
    console.log(`  abiSource: ${cfg.abi.sourcePath}`);
    console.log(`  supportedActions:`);
    for (const [action, a] of Object.entries(cfg.supportedActions)) {
      const method = a.method ?? "unknown";
      console.log(`    - ${action}: supported=${a.supported} method=${method} methodStatus=${a.methodStatus}`);
    }
    if (warnings.length > 0) {
      console.log(`  warnings:`);
      for (const w of warnings) console.log(`    - ${w}`);
    }
    console.log("");
  }
}

main().catch((err) => {
  console.error("[inspect_protocols] Error:", err.message || err);
  process.exit(1);
});
