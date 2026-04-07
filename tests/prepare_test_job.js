#!/usr/bin/env node
/**
 * prepare_test_job.js — Prepare a test job for Phase 2 testing
 * Converts job_test_1.json into the hydrated+analyzed format
 * that select_job.js expects.
 *
 * Writes: /tmp/intake/analyzed.json (single-job array)
 */
"use strict";

const fs   = require("fs");
const path = require("path");

const specPath = path.join(__dirname, "../test/job_test_1.json");
const spec     = JSON.parse(fs.readFileSync(specPath, "utf8"));
const props    = spec.properties || {};

const job = {
  jobId:           99,
  status:          "Open",
  title:           props.title || spec.name || "Test Job",
  category:        props.category || "documentation",
  summary:         props.summary || spec.description || "",
  payout_agialpha: parseInt(props.payoutAGIALPHA || "0", 10),
  payout_raw:      props.payoutAGIALPHA + " AGIALPHA",
  specURI:         "ipfs://test",
  deliverables:    props.deliverables || [],
  requirements:    props.requirements || [],
  spec,
  score:           0.9,
  recommendation:  "apply",
  reasoning:       "Test job — documentation task, high payout, clear deliverables",
  feasibility:     "high",
};

fs.mkdirSync("/tmp/intake", { recursive: true });
fs.writeFileSync("/tmp/intake/analyzed.json", JSON.stringify([job]));
fs.writeFileSync("/tmp/selected_job.json", JSON.stringify(job, null, 2));

process.stderr.write(`[prepare_test_job] Wrote test job: "${job.title}"\n`);
process.stdout.write(`job_id=${job.jobId}\njob_title=${job.title.slice(0, 80)}\n`);
