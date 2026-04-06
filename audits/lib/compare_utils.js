// audits/lib/compare_utils.js
// Comparison utilities for audit checks — diff detection, regression tracking.

import { deepEqual } from "./json_utils.js";

export function findDifferences(a, b, path = "") {
  const diffs = [];

  if (a === b) return diffs;
  if (a == null || b == null) {
    diffs.push({ path, type: "null_mismatch", a, b });
    return diffs;
  }
  if (typeof a !== typeof b) {
    diffs.push({ path, type: "type_mismatch", aType: typeof a, bType: typeof b });
    return diffs;
  }

  if (Array.isArray(a)) {
    if (a.length !== b.length) {
      diffs.push({ path, type: "array_length", a: a.length, b: b.length });
    }
    const maxLen = Math.max(a.length, b.length);
    for (let i = 0; i < maxLen; i++) {
      diffs.push(...findDifferences(a[i], b[i], `${path}[${i}]`));
    }
    return diffs;
  }

  if (typeof a === "object") {
    const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of allKeys) {
      if (!(key in a)) {
        diffs.push({ path: `${path}.${key}`, type: "missing_in_a", b: b[key] });
      } else if (!(key in b)) {
        diffs.push({ path: `${path}.${key}`, type: "missing_in_b", a: a[key] });
      } else {
        diffs.push(...findDifferences(a[key], b[key], `${path}.${key}`));
      }
    }
    return diffs;
  }

  diffs.push({ path, type: "value_mismatch", a, b });
  return diffs;
}

export function hasRegression(baseline, current, ignoreKeys = new Set()) {
  return !deepEqual(baseline, current, ignoreKeys);
}

export function compareAuditResults(prev, curr) {
  const changes = [];
  if (prev.status !== curr.status) {
    changes.push({ field: "status", from: prev.status, to: curr.status });
  }
  if (prev.summary && curr.summary) {
    for (const key of ["pass", "warn", "fail", "critical"]) {
      if (prev.summary[key] !== curr.summary[key]) {
        changes.push({ field: `summary.${key}`, from: prev.summary[key], to: curr.summary[key] });
      }
    }
  }
  return changes;
}
