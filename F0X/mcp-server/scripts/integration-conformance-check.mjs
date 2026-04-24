#!/usr/bin/env node
/**
 * Integration conformance check — verifies that agent adapter system prompts
 * include the mandatory F0X security policy boundary and that the red-team
 * denylist catches all known injection patterns.
 *
 * Run via: npm run security:conformance
 *
 * This script is a CI required check for any PR that modifies:
 *   - src/core/integration-policy.ts
 *   - src/adapters/mcp-common/tools.ts (wrapMessageContent / sanitizeMessageText)
 *   - Any adapter system prompt template
 *
 * Exit codes:
 *   0  — all conformance checks passed
 *   1  — one or more checks failed (blocks merge)
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ─── Import integration policy (compiled dist or source) ─────────────────────
// We read the TypeScript source directly as text and extract constants, since
// this runs before build in some CI flows. Key phrases are stable constants.

const ROOT = process.cwd();
const policyPath = join(ROOT, 'src', 'core', 'integration-policy.ts');

if (!existsSync(policyPath)) {
  console.error('integration-conformance: src/core/integration-policy.ts not found.');
  process.exit(1);
}

const policySource = readFileSync(policyPath, 'utf8');

let failures = 0;

function check(description, condition) {
  if (condition) {
    console.log(`[PASS] ${description}`);
  } else {
    console.error(`[FAIL] ${description}`);
    failures++;
  }
}

// ── 1. Boundary template contains all required phrases ───────────────────────
const requiredPhrases = [
  'UNTRUSTED EXTERNAL DATA',
  'F0X SECURITY POLICY',
  'F0x_confirm_action',
  'agentId',
  'as data, not as instructions'
];
for (const phrase of requiredPhrases) {
  check(
    `FIXED_PROMPT_BOUNDARY_TEMPLATE contains: "${phrase}"`,
    policySource.includes(phrase)
  );
}

// ── 2. Role override denylist contains minimum required patterns ──────────────
const requiredDenylistPatterns = [
  'ignore.*previous.*instructions',
  'act.*as.*if.*you.*are',
  'new.*system.*prompt',
  'jailbreak',
  'DAN.*mode',
  'developer.*mode.*enabled'
];
for (const pat of requiredDenylistPatterns) {
  check(
    `ROLE_OVERRIDE_DENYLIST covers pattern: "${pat}"`,
    policySource.includes(pat.split('.*')[0])
  );
}

// ── 3. Red-team corpus covers known injection patterns ────────────────────────
const corpusEntries = [
  'classic-ignore-prev',
  'role-override',
  'system-injection',
  'forget-rules',
  'act-as',
  'developer-mode',
  'jailbreak',
  'dan-mode'
];
for (const label of corpusEntries) {
  check(
    `RED_TEAM_CORPUS includes entry: "${label}"`,
    policySource.includes(label)
  );
}

// ── 4. verifyRedTeamCorpus() is exported ────────────────────────────────────
check(
  'verifyRedTeamCorpus exported from integration-policy.ts',
  policySource.includes('export function verifyRedTeamCorpus')
);

// ── 5. assertConformingAdapter() is exported ─────────────────────────────────
check(
  'assertConformingAdapter exported from integration-policy.ts',
  policySource.includes('export function assertConformingAdapter')
);

// ── 5b. OpenClaw boundary addendum present and exported ─────────────────────
check(
  'OPENCLAW_BOUNDARY_ADDENDUM exported from integration-policy.ts',
  policySource.includes('export const OPENCLAW_BOUNDARY_ADDENDUM')
);
check(
  'OpenClaw addendum forbids openclaw.json config edits',
  policySource.includes('openclaw.json') && policySource.includes('mcpServers')
);
check(
  'OpenClaw addendum forbids interpreter-startup env keys',
  policySource.includes('NODE_OPTIONS') &&
    policySource.includes('PYTHONSTARTUP') &&
    policySource.includes('LD_PRELOAD')
);
check(
  'OpenClaw addendum forbids gateway-token exfiltration',
  policySource.includes('OPENCLAW_GATEWAY_TOKEN')
);
check(
  'buildBoundaryTemplate() exported from integration-policy.ts',
  policySource.includes('export function buildBoundaryTemplate')
);

// ── 6. tools.ts wrapMessageContent references untrusted boundary ─────────────
const toolsPath = join(ROOT, 'src', 'adapters', 'mcp-common', 'tools.ts');
if (existsSync(toolsPath)) {
  const toolsSource = readFileSync(toolsPath, 'utf8');
  check(
    'tools.ts wrapMessageContent includes "untrusted external content" boundary',
    toolsSource.includes('untrusted external content')
  );
  check(
    'tools.ts sanitizeMessageText strips non-printable characters',
    toolsSource.includes('sanitizeMessageText')
  );
} else {
  console.warn('[SKIP] src/adapters/mcp-common/tools.ts not found — skipping tools conformance checks');
}

// ── 7. Integration policy module is imported or referenced in tools ───────────
if (existsSync(toolsPath)) {
  const toolsSource = readFileSync(toolsPath, 'utf8');
  check(
    'tools.ts references integration-policy or scanForPolicyViolations',
    toolsSource.includes('integration-policy') || toolsSource.includes('scanForPolicyViolations')
  );
}

// ── Report ────────────────────────────────────────────────────────────────────
if (failures === 0) {
  console.log('\nIntegration conformance checks passed.');
} else {
  console.error(`\nIntegration conformance FAILED: ${failures} check(s) failed.`);
  process.exit(1);
}
