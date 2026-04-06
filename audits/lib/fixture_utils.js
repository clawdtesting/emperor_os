// audits/lib/fixture_utils.js
// Fixture loading and management for audit checks.

import { readFileSync, existsSync, readdirSync } from "fs";
import path from "path";
import { FIXTURES_DIR } from "./constants.js";
import { safeParse } from "./json_utils.js";

export function loadFixture(fixturePath) {
  const fullPath = path.isAbsolute(fixturePath) ? fixturePath : path.join(FIXTURES_DIR, fixturePath);
  if (!existsSync(fullPath)) return null;
  const raw = readFileSync(fullPath, "utf8");
  return safeParse(raw, raw);
}

export function loadJsonFixture(fixturePath) {
  const fullPath = path.isAbsolute(fixturePath) ? fixturePath : path.join(FIXTURES_DIR, fixturePath);
  if (!existsSync(fullPath)) return null;
  const raw = readFileSync(fullPath, "utf8");
  return safeParse(raw, null);
}

export function listFixtures(subdir) {
  const dir = subdir ? path.join(FIXTURES_DIR, subdir) : FIXTURES_DIR;
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith(".json"));
}

export function loadAllFixtures(subdir) {
  const files = listFixtures(subdir);
  const results = [];
  for (const f of files) {
    const data = loadJsonFixture(path.join(subdir || "", f));
    if (data !== null) {
      results.push({ file: f, data });
    }
  }
  return results;
}
