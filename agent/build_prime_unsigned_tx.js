#!/usr/bin/env node
"use strict";

import { buildCommitApplicationTx, buildRevealApplicationTx, buildAcceptFinalistTx, buildSubmitTrialTx } from "./prime-tx-builder.js";
import { promises as fs } from "fs";
import path from "path";

const ACTIONS = {
  commit: buildCommitApplicationTx,
  reveal: buildRevealApplicationTx,
  "accept-finalist": buildAcceptFinalistTx,
  "submit-trial": buildSubmitTrialTx,
};

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("Usage: node agent/build_prime_unsigned_tx.js <action> <fixtureProcurementId>");
    console.error("Actions: commit, reveal, accept-finalist, submit-trial");
    process.exit(1);
  }

  const [actionStr, procurementIdStr] = args;
  const procurementId = parseInt(procurementIdStr, 10);
  if (isNaN(procurementId)) {
    console.error("Error: procurementId must be an integer");
    process.exit(1);
  }

  const actionFn = ACTIONS[actionStr];
  if (!actionFn) {
    console.error(`Error: Unknown action '${actionStr}'. Available actions: ${Object.keys(ACTIONS).join(", ")}`);
    process.exit(1);
  }

  // Fixture data - clearly marked as test/fixture data
  const fixtureOpts = {
    procurementId,
    linkedJobId: 2001, // fixture jobId
    // Action-specific fixture data
    commitment: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef", // 32 bytes
    subdomain: "fixture-agent.prime",
    merkleProof: [
      "0x1111111111111111111111111111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222222222222222222222222222"
    ],
    salt: "0x3333333333333333333333333333333333333333333333333333333333333333",
    applicationURI: "ipfs://bafybeigdyrzt5wfp7ud7aghu7q4tfy5t3sa6rllghx62e6n2qgz6fudaaq/application_brief.md",
    trialURI: "ipfs://bafybeigdyrzt5wfp7ud7aghu7q4tfy5t3sa6rllghx62e6n2qgz6fudaaq/trial_deliverables.zip"
  };

  // Filter opts to only those required by the specific action
  let opts = {};
  switch (actionStr) {
    case "commit":
      opts = {
        procurementId: fixtureOpts.procurementId,
        linkedJobId: fixtureOpts.linkedJobId,
        commitment: fixtureOpts.commitment,
        subdomain: fixtureOpts.subdomain,
        merkleProof: fixtureOpts.merkleProof,
        applicationArtifactPath: path.join(process.cwd(), "fixtures", "application_brief.md") // dummy path
      };
      break;
    case "reveal":
      opts = {
        procurementId: fixtureOpts.procurementId,
        linkedJobId: fixtureOpts.linkedJobId,
        subdomain: fixtureOpts.subdomain,
        merkleProof: fixtureOpts.merkleProof,
        salt: fixtureOpts.salt,
        applicationURI: fixtureOpts.applicationURI
      };
      break;
    case "accept-finalist":
      opts = {
        procurementId: fixtureOpts.procurementId,
        linkedJobId: fixtureOpts.linkedJobId
      };
      break;
    case "submit-trial":
      opts = {
        procurementId: fixtureOpts.procurementId,
        linkedJobId: fixtureOpts.linkedJobId,
        trialURI: fixtureOpts.trialURI
      };
      break;
    default:
      console.error(`Internal error: unhandled action ${actionStr}`);
      process.exit(1);
  }

  try {
    const result = await actionFn(opts);
    console.log(`Successfully built unsigned ${actionStr} tx package for procurementId ${procurementId}`);
    console.log(`Package written to: ${result.path}`);
    // Optionally, print a summary of the package (without calldata to avoid clutter)
    const { path: pkgPath, package: pkg } = result;
    const { calldata, ...pkgSummary } = pkg;
    console.log("Package summary:");
    console.log(JSON.stringify(pkgSummary, null, 2));
  } catch (err) {
    console.error(`Failed to build ${actionStr} tx package:`, err.message);
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Unexpected error:", err.message);
  process.exit(1);
});