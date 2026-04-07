#!/usr/bin/env node
/**
 * build_report.js — Build report.json from analyzed.json
 * Writes /tmp/report.json and prints GITHUB_OUTPUT lines to stdout.
 */
"use strict";

const fs = require("fs");

let jobs;
try {
  jobs = JSON.parse(fs.readFileSync("/tmp/analyzed.json", "utf8"));
  if (!Array.isArray(jobs)) jobs = [jobs];
} catch (e) {
  process.stderr.write("build_report: could not read analyzed.json: " + e.message + "\n");
  process.stdout.write("top_job_id=\ntop_rec=skip\n");
  process.exit(0);
}

const top = jobs[0] || {};

const report = {
  run:      parseInt(process.env.GITHUB_RUN_NUMBER || "0", 10),
  built_at: new Date().toISOString(),
  total:    jobs.length,
  top: {
    jobId:       top.jobId,
    title:       top.title,
    payout:      top.payout_agialpha,
    score:       top.score,
    rec:         top.recommendation,
    reasoning:   top.reasoning,
    feasibility: top.feasibility,
    risks:       top.risks || [],
    specURI:     top.specURI,
    status:      top.status,
  },
  all: jobs.map(j => ({
    jobId:  j.jobId,
    title:  j.title,
    payout: j.payout_agialpha,
    score:  j.score,
    rec:    j.recommendation,
    status: j.status,
  })),
};

fs.writeFileSync("/tmp/report.json", JSON.stringify(report, null, 2));

// Print GITHUB_OUTPUT lines
console.log("top_job_id=" + (top.jobId ?? ""));
console.log("top_rec=" + (top.recommendation || "skip"));

process.stderr.write(
  "Report built: top=" + top.jobId + " rec=" + top.recommendation +
  " score=" + top.score + "\n"
);
