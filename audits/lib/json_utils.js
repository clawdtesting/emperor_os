// audits/lib/json_utils.js
// JSON utilities for audit checks.

import { readFileSync, existsSync } from "fs";

export function safeParse(jsonStr, fallback = null) {
  try {
    return JSON.parse(jsonStr);
  } catch {
    return fallback;
  }
}

export function safeReadFileSync(filePath, fallback = null) {
  try {
    if (!existsSync(filePath)) return fallback;
    return safeParse(readFileSync(filePath, "utf8"), fallback);
  } catch {
    return fallback;
  }
}

export function hasRequiredKeys(obj, keys) {
  if (!obj || typeof obj !== "object") return false;
  return keys.every(k => obj[k] !== undefined && obj[k] !== null);
}

export function deepEqual(a, b, ignoreKeys = new Set()) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i], ignoreKeys));
  }

  if (typeof a === "object") {
    const keysA = Object.keys(a).filter(k => !ignoreKeys.has(k));
    const keysB = Object.keys(b).filter(k => !ignoreKeys.has(k));
    if (keysA.length !== keysB.length) return false;
    return keysA.every(k => deepEqual(a[k], b[k], ignoreKeys));
  }

  return false;
}
