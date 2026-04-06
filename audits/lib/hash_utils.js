// audits/lib/hash_utils.js
// Hashing utilities for audit checks.

import { createHash } from "crypto";
import { readFileSync } from "fs";

export function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function sha256File(filePath) {
  const content = readFileSync(filePath, "utf8");
  return sha256(content);
}

export function sha256Json(obj) {
  return sha256(JSON.stringify(obj));
}

export function hashMatch(actual, expected) {
  return actual.toLowerCase() === expected.toLowerCase();
}
