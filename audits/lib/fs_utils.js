// audits/lib/fs_utils.js
// Filesystem utilities for audit checks.

import { promises as fs } from "fs";
import path from "path";

export async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readText(filePath) {
  return fs.readFile(filePath, "utf8");
}

export async function readJson(filePath) {
  const raw = await readText(filePath);
  return JSON.parse(raw);
}

export async function listFiles(dir, filter) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "audits") continue;
        files.push(...await listFiles(fullPath, filter));
      } else if (!filter || filter(entry.name, fullPath)) {
        files.push(fullPath);
      }
    }
    return files;
  } catch {
    return [];
  }
}


export async function searchInFiles(dir, pattern, fileFilter) {
  const files = await listFiles(dir, fileFilter);
  const matches = [];
  for (const filePath of files) {
    try {
      const content = await readText(filePath);
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          matches.push({
            file: filePath,
            line: i + 1,
            content: lines[i].trim(),
          });
        }
      }
    } catch {
      // skip binary or unreadable files
    }
  }
  return matches;
}

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}
