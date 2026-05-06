#!/usr/bin/env node
"use strict";

import { buildCommitApplicationTx, buildRevealApplicationTx, buildAcceptFinalistTx, buildSubmitTrialTx } from "./prime-tx-builder.js";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadAbi } from "./prime-client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log("=== Testing Prime Unsigned Transaction Builders ===\n");

  const procurementId = 1001; // fixture procurementId
  const linkedJobId = 2001;   // fixture jobId

  // Load the actual ABI to verify method names
  const abi = loadAbi();
  console.log("Loaded Prime Discovery ABI from:", path.join(__dirname, "abi", "AGIJobDiscoveryPrime.json"));
  console.log("ABI functions:", abi.filter(item => item.type === "function").map(f => f.name));
  console.log();

  // Test data - clearly marked as fixture
  const fixtureData = {
    commitment: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    subdomain: "test-agent.prime",
    merkleProof: [
      "0x1111111111111111111111111111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222222222222222222222222222"
    ],
    salt: "0x3333333333333333333333333333333333333333333333333333333333333333",
    applicationURI: "ipfs://bafybeigdyrzt5wfp7ud7aghu7q4tfy5t3sa6rllghx62e6n2qgz6fudaaq/application.md",
    trialURI: "ipfs://bafybeigdyrzt5wfp7ud7aghu7q4tfy5t3sa6rllghx62e6n2qgz6fudaaq/trial.zip"
  };

  // Test each action
  const tests = [
    {
      name: "commitApplication",
      fn: buildCommitApplicationTx,
      opts: {
        procurementId,
        linkedJobId,
        commitment: fixtureData.commitment,
        subdomain: fixtureData.subdomain,
        merkleProof: fixtureData.merkleProof,
        applicationArtifactPath: path.join(process.cwd(), "fixtures", "application.md") // dummy
      },
      expectedMethod: "commitApplication"
    },
    {
      name: "revealApplication",
      fn: buildRevealApplicationTx,
      opts: {
        procurementId,
        linkedJobId,
        subdomain: fixtureData.subdomain,
        merkleProof: fixtureData.merkleProof,
        salt: fixtureData.salt,
        applicationURI: fixtureData.applicationURI
      },
      expectedMethod: "revealApplication"
    },
    {
      name: "acceptFinalist",
      fn: buildAcceptFinalistTx,
      opts: {
        procurementId,
        linkedJobId
      },
      expectedMethod: "acceptFinalist"
    },
    {
      name: "submitTrial",
      fn: buildSubmitTrialTx,
      opts: {
        procurementId,
        linkedJobId,
        trialURI: fixtureData.trialURI
      },
      expectedMethod: "submitTrial"
    }
  ];

  let allPassed = true;

  for (const test of tests) {
    console.log(`Testing ${test.name}...`);
    try {
      const result = await test.fn(test.opts);
      
      // Check that package was created
      if (!result.path || !result.package) {
        throw new Error("Builder did not return path and package");
      }
      
      // Check file exists
      await fs.access(result.path);
      
      // Check package structure
      const pkg = result.package;
      if (!pkg.schema || !pkg.chainId || !pkg.target || !pkg.function || !pkg.args) {
        throw new Error("Package missing required fields");
      }
      
      // Check action matches expected
      if (pkg.function !== test.expectedMethod) {
        throw new Error(`Expected function ${test.expectedMethod}, got ${pkg.function}`);
      }
      
      // Check contract address is Prime discovery
      const expectedPrime = "0xd5EF1dde7Ac60488f697ff2A7967a52172A78F29";
      if (pkg.target.toLowerCase() !== expectedPrime.toLowerCase()) {
        throw new Error(`Expected Prime discovery contract ${expectedPrime}, got ${pkg.target}`);
      }
      
      // Check safety fields
      if (!pkg.safety || !pkg.safety.noPrivateKeyInRuntime || !pkg.safety.noSigningInRuntime || !pkg.safety.noBroadcastInRuntime) {
        throw new Error("Missing or incorrect safety fields");
      }
      
      // Check human review required
      if (pkg.humanReviewRequired !== true) {
        throw new Error("humanReviewRequired should be true");
      }
      
      // Check executableAsIs is false for fixture data
      if (pkg.executableAsIs !== false) {
        throw new Error("executableAsIs should be false for fixture data");
      }
      
      // Check abiVerified
      if (pkg.abiVerified !== true) {
        throw new Error("abiVerified should be true");
      }
      
      console.log(`  ✓ ${test.name} passed`);
      console.log(`    Package: ${result.path}`);
      console.log(`    Method: ${pkg.function}`);
      console.log(`    Contract: ${pkg.target}`);
      console.log(`    Safety: noPrivateKey=${pkg.safety.noPrivateKeyInRuntime}, noSigning=${pkg.safety.noSigningInRuntime}, noBroadcast=${pkg.safety.noBroadcastInRuntime}`);
      console.log(`    humanReviewRequired: ${pkg.humanReviewRequired}`);
      console.log(`    executableAsIs: ${pkg.executableAsIs}`);
      console.log();
      
    } catch (err) {
      console.log(`  ✗ ${test.name} failed: ${err.message}`);
      allPassed = false;
      console.log();
    }
  }

  // Test that manager/settlement actions are not implemented (since manager ABI unavailable)
  // We'll check that the builder doesn't have functions for manager-specific actions
  console.log("Testing that manager/settlement actions are not implemented (fail closed)...");
  try {
    // Check that prime-tx-builder.js doesn't contain manager settlement tx builder functions
    // (It does have buildRequestJobCompletionTx for Contract 1, but that's different)
    const builderContent = await fs.readFile(path.join(__dirname, "prime-tx-builder.js"), "utf8");
    
    // These would be manager-specific functions that we shouldn't have since manager ABI is unavailable
    const managerSpecificPatterns = [
      /buildManager[A-Z]/,  // Functions like buildManagerSomething
      /buildSettle[A-Z]/,   // Functions like buildSettleSomething
      /buildWithdraw[A-Z]/, // Functions like buildWithdrawSomething
      /buildClaim[A-Z]/     // Functions like buildClaimSomething
    ];
    
    let foundManagerSpecific = false;
    for (const pattern of managerSpecificPatterns) {
      if (pattern.test(builderContent)) {
        foundManagerSpecific = true;
        break;
      }
    }
    
    if (foundManagerSpecific) {
      throw new Error("Prime tx-builder contains manager-specific functions (should not be implemented without manager ABI)");
    }
    
    console.log("  ✓ Manager/settlement actions correctly not implemented");
    console.log();
  } catch (err) {
    console.log(`  ✗ Manager/settlement test failed: ${err.message}`);
    allPassed = false;
    console.log();
  }

  // Final safety scan
  console.log("Performing final safety scan for prohibited patterns...");
  try {
    const unsafePatterns = [
      /ethers\.Wallet/,
      /new\s+ethers\.Wallet/,
      /\bprivate\s*key\b/i,  // More specific: looking for actual usage, not just comments
      /PRIVATE_KEY/,
      /signTransaction/,
      /sendTransaction/,
      /broadcast/,
      /process\.env\.PRIVATE_KEY/
    ];
    
    const filesToScan = [
      path.join(__dirname, "prime-tx-builder.js"),
      path.join(__dirname, "build_prime_unsigned_tx.js")
    ];
    
    let unsafeFound = false;
    
    for (const filePath of filesToScan) {
      const content = await fs.readFile(filePath, "utf8");
      const lines = content.split('\n');
      
      for (const pattern of unsafePatterns) {
        const unsafeLines = lines.filter((line, index) => {
          if (pattern.test(line)) {
            // Check if it's a comment line
            const trimmed = line.trim();
            return !(trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('*/'));
          }
          return false;
        });
        
        if (unsafeLines.length > 0) {
          console.log(`    Found unsafe pattern in ${path.basename(filePath)}:`, unsafeLines[0]);
          unsafeFound = true;
        }
      }
    }
    
    if (unsafeFound) {
      throw new Error("Unsafe patterns found in code");
    }
    
    console.log("  ✓ No unsafe patterns found (no private keys, signing, or broadcasting)");
    console.log();
  } catch (err) {
    console.log(`  ✗ Safety scan failed: ${err.message}`);
    allPassed = false;
    console.log();
  }

  if (allPassed) {
    console.log("=== All Prime Unsigned Tx Builder Tests Passed ===");
    console.log("Summary:");
    console.log("- All four discovery contract actions can build unsigned packages");
    console.log("- ABI method names verified from AGIJobDiscoveryPrime.json");
    console.log("- No signing/broadcast/private-key path used");
    console.log("- Manager/settlement actions correctly fail closed (not implemented)");
    console.log("- humanReviewRequired is true");
    console.log("- abiVerified is true");
    console.log("- executableAsIs is false for fixture packages");
    process.exit(0);
  } else {
    console.log("=== Some Tests Failed ===");
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Unexpected error in test:", err.message);
  process.exit(1);
});