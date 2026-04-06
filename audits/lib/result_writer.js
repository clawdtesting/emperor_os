// audits/lib/result_writer.js
// Writes JSON reports, Markdown summaries, and maintains latest symlinks.

import { promises as fs } from "fs";
import path from "path";
import { LATEST_REPORT_DIR, HISTORY_REPORT_DIR } from "./constants.js";
import { reportToMarkdown } from "./report_builder.js";

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export async function writeJsonReport(report, auditType) {
  await ensureDir(LATEST_REPORT_DIR);
  await ensureDir(HISTORY_REPORT_DIR);

  const latestPath = path.join(LATEST_REPORT_DIR, `${auditType || "master"}.json`);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const historyPath = path.join(HISTORY_REPORT_DIR, `${auditType || "master"}_${timestamp}.json`);

  const json = JSON.stringify(report, null, 2);
  await fs.writeFile(latestPath, json, "utf8");
  await fs.writeFile(historyPath, json, "utf8");

  return { latestPath, historyPath };
}

export async function writeMarkdownReport(report, auditType) {
  await ensureDir(LATEST_REPORT_DIR);
  await ensureDir(HISTORY_REPORT_DIR);

  const md = reportToMarkdown(report);
  const latestPath = path.join(LATEST_REPORT_DIR, `${auditType || "master"}.md`);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const historyPath = path.join(HISTORY_REPORT_DIR, `${auditType || "master"}_${timestamp}.md`);

  await fs.writeFile(latestPath, md, "utf8");
  await fs.writeFile(historyPath, md, "utf8");

  return { latestPath, historyPath };
}

export async function writeFullReport(report, auditType) {
  const jsonPaths = await writeJsonReport(report, auditType);
  const mdPaths = await writeMarkdownReport(report, auditType);
  return { ...jsonPaths, ...mdPaths };
}

export async function readLatestReport(auditType) {
  const latestPath = path.join(LATEST_REPORT_DIR, `${auditType || "master"}.json`);
  try {
    const raw = await fs.readFile(latestPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
