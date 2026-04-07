#!/usr/bin/env node
/**
 * send_apply_report.js — Send Phase 2 completion report to Telegram
 * Reads /tmp/ipfs_result.json and /tmp/writer_result.json
 */
"use strict";

const fs   = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const RUN_URL    = process.env.RUN_URL    || "";
const RUN_NUMBER = process.env.RUN_NUMBER || "?";

let ipfs, writer;
try { ipfs   = JSON.parse(fs.readFileSync("/tmp/ipfs_result.json",   "utf8")); } catch (_) { ipfs   = null; }
try { writer = JSON.parse(fs.readFileSync("/tmp/writer_result.json", "utf8")); } catch (_) { writer = null; }

const lines = [`EmpireOS Apply #${RUN_NUMBER} Complete`, ""];

if (!writer || writer.error) {
  lines.push("WRITE: FAILED — " + (writer?.error || "no output"));
} else {
  lines.push(`WRITE: ${writer.filename} (${writer.length} chars)`);
}

if (!ipfs || ipfs.error) {
  lines.push("IPFS: FAILED — " + (ipfs?.error || "no output"));
} else {
  lines.push("IPFS: Pinned successfully");
  lines.push(`File URI: ${ipfs.file_uri}`);
  lines.push(`Gateway: ${ipfs.gateway_url}`);
  lines.push("");
  lines.push("COMPLETION URI (submit this on-chain):");
  lines.push(ipfs.completion_uri || "N/A");
}

if (RUN_URL) { lines.push(""); lines.push("Run: " + RUN_URL); }

const msg = lines.join("\n");
const notifyPath = path.join(__dirname, "../tools/notify.js");
spawnSync(process.execPath, [notifyPath, msg], {
  env: process.env, stdio: "inherit", timeout: 15000,
});
