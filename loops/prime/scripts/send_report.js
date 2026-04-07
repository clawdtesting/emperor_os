#!/usr/bin/env node
/**
 * send_report.js — Build and send Telegram intake report
 * Reads /tmp/report.json, sends formatted message via notify.js
 */
"use strict";

const fs   = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const RUN_URL    = process.env.RUN_URL    || "";
const RUN_NUMBER = process.env.RUN_NUMBER || "?";

let report;
try {
  report = JSON.parse(fs.readFileSync("/tmp/report.json", "utf8"));
} catch (_) {
  report = null;
}

const emoji = { apply: "GREEN", skip: "BLACK", review: "YELLOW" };
const flag  = { apply: "\u2705", skip: "\u26ab", review: "\u26a1" };

let msg;
if (!report) {
  msg = `EmpireOS Intake #${RUN_NUMBER} - no jobs found`;
} else {
  const top = report.top || {};
  const lines = [
    `EmpireOS Intake #${RUN_NUMBER}`,
    "",
    `Total jobs: ${report.total}`,
    "",
    "TOP OPPORTUNITY:",
    `  #${top.jobId} - ${top.title || "N/A"}`,
    `  Payout: ${(top.payout || 0).toLocaleString()} AGIALPHA`,
    `  Score: ${typeof top.score === "number" ? top.score.toFixed(2) : "N/A"}`,
    `  Recommendation: ${(top.rec || "").toUpperCase()}`,
    `  ${top.reasoning || ""}`,
    "",
    "ALL JOBS:",
  ];

  for (const j of (report.all || [])) {
    const f = flag[j.rec] || "\u25ef";
    lines.push(`  ${f} #${j.jobId} ${j.title?.slice(0, 35) || "?"} | ${(j.payout || 0).toLocaleString()} AGIALPHA | score:${typeof j.score === "number" ? j.score.toFixed(2) : "?"}`);
  }

  if (RUN_URL) {
    lines.push("");
    lines.push("View run: " + RUN_URL);
  }

  msg = lines.join("\n");
}

const notifyPath = path.join(__dirname, "../tools/notify.js");
const result = spawnSync(process.execPath, [notifyPath, msg], {
  env:    process.env,
  stdio:  ["inherit", "inherit", "inherit"],
  timeout: 15000,
});

process.exit(result.status || 0);
