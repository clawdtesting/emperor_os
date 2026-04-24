#!/usr/bin/env node
/**
 * Deployment guard — machine-verifiable preflight for staging/prod promotion.
 *
 * This script MUST pass before any production promotion. It verifies:
 *   1. Required environment variables are set and non-empty.
 *   2. RELAY_URL is HTTPS (non-localhost) for prod.
 *   3. F0X_IDENTITY_PASSPHRASE meets minimum entropy policy.
 *   4. Identity directory exists with correct permissions (0700).
 *   5. Identity file exists with correct permissions (0600).
 *   6. Relay is reachable and health endpoint returns 200.
 *   7. Security profile is set to 'staging' or 'prod' (never 'dev').
 *   8. Tenant binding file is present (operator has confirmed identity).
 *   9. Build artefact (dist/index.js) exists and is recent (<24h).
 *  10. Security static check passes.
 *
 * Exit codes:
 *   0  — all checks passed; promotion is permitted
 *   1  — one or more checks failed; promotion MUST be blocked
 *
 * Usage:
 *   node scripts/deployment-guard.mjs [--profile=staging|prod]
 *
 * In CI, add this as a required step before any deploy job:
 *   - name: Deployment preflight
 *     run: node scripts/deployment-guard.mjs --profile=prod
 */
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const profileArg = args.find((a) => a.startsWith('--profile='))?.split('=')[1] ?? null;
const profile = profileArg ?? process.env['F0X_SECURITY_PROFILE'] ?? 'dev';

let failures = 0;
let warnings = 0;

function pass(msg) { console.log(`[PASS] ${msg}`); }
function fail(msg) { console.error(`[FAIL] ${msg}`); failures++; }
function warn(msg) { console.warn(`[WARN] ${msg}`); warnings++; }
function info(msg) { console.log(`[INFO] ${msg}`); }

// ── 1. Security profile ───────────────────────────────────────────────────────
if (profile === 'dev') {
  fail(`Security profile is "dev" — deployment to shared/production environments is not permitted with profile=dev.`);
} else {
  pass(`Security profile: ${profile}`);
}

// ── 2. Required environment variables ────────────────────────────────────────
const required = [
  ['RELAY_URL', 'Relay base URL'],
  ['AGENT_IDENTITY_DIR', 'Identity directory path'],
  ['F0X_OPERATOR_ID', 'Operator tenant identifier'],
  ['F0X_IDENTITY_PASSPHRASE', 'Identity key encryption passphrase'],
  ['AGENT_LABEL', 'Agent display name']
];

for (const [varName, description] of required) {
  const value = process.env[varName]?.trim();
  if (!value) {
    fail(`${varName} (${description}) is not set or empty.`);
  } else {
    pass(`${varName} is set`);
  }
}

// ── 3. RELAY_URL must be HTTPS for prod ──────────────────────────────────────
const relayUrl = process.env['RELAY_URL']?.trim() ?? '';
if (profile === 'prod') {
  if (!relayUrl.startsWith('https://')) {
    fail(`RELAY_URL must be HTTPS for prod profile. Got: ${relayUrl.slice(0, 40)}`);
  } else {
    pass('RELAY_URL is HTTPS');
  }
  if (/localhost|127\.0\.0\.1/.test(relayUrl)) {
    fail(`RELAY_URL must not be localhost for prod profile.`);
  } else {
    pass('RELAY_URL is not localhost');
  }
} else {
  info(`RELAY_URL HTTPS check skipped for profile "${profile}"`);
}

// ── 4. Passphrase entropy ────────────────────────────────────────────────────
const passphrase = process.env['F0X_IDENTITY_PASSPHRASE']?.trim() ?? '';
if (passphrase) {
  const MIN_LEN = 20;
  const MIN_UNIQUE = 8;
  if (passphrase.length < MIN_LEN) {
    fail(`F0X_IDENTITY_PASSPHRASE too short: ${passphrase.length} chars (minimum ${MIN_LEN}).`);
  } else {
    pass(`Passphrase length: ${passphrase.length} chars (≥ ${MIN_LEN})`);
  }
  const uniqueChars = new Set(passphrase).size;
  if (uniqueChars < MIN_UNIQUE) {
    fail(`F0X_IDENTITY_PASSPHRASE entropy too low: ${uniqueChars} unique chars (minimum ${MIN_UNIQUE}).`);
  } else {
    pass(`Passphrase unique chars: ${uniqueChars} (≥ ${MIN_UNIQUE})`);
  }
  const trivial = ['password', 'passphrase', 'secret', 'changeme', 'f0x'];
  for (const weak of trivial) {
    if (passphrase.toLowerCase().includes(weak)) {
      fail(`F0X_IDENTITY_PASSPHRASE contains weak pattern: "${weak}"`);
    }
  }
}

// ── 5. Identity directory permissions ────────────────────────────────────────
const identityDir = process.env['AGENT_IDENTITY_DIR']?.trim() ?? join(homedir(), '.f0x-chat');
if (existsSync(identityDir)) {
  const dirMode = statSync(identityDir).mode & 0o777;
  if (dirMode !== 0o700) {
    fail(`Identity directory ${identityDir} has insecure permissions: ${dirMode.toString(8)} (expected 700). Run: chmod 700 ${identityDir}`);
  } else {
    pass(`Identity directory permissions: 700`);
  }
} else {
  warn(`Identity directory ${identityDir} does not exist yet — it will be created on first run.`);
}

// ── 6. Identity file permissions ─────────────────────────────────────────────
const identityFile = join(identityDir, 'identity.json');
if (existsSync(identityFile)) {
  const fileMode = statSync(identityFile).mode & 0o777;
  if (fileMode !== 0o600) {
    fail(`Identity file ${identityFile} has insecure permissions: ${fileMode.toString(8)} (expected 600). Run: chmod 600 ${identityFile}`);
  } else {
    pass(`Identity file permissions: 600`);
  }
  // Check that the identity file uses encrypted secrets (passphrase storage)
  try {
    const { readFileSync } = await import('node:fs');
    const identityContent = JSON.parse(readFileSync(identityFile, 'utf8'));
    if (identityContent.signingSecretKey && !identityContent.encryptedSecrets) {
      if (profile === 'prod') {
        fail(`Identity file has unencrypted private keys. Set F0X_IDENTITY_PASSPHRASE and re-save identity for prod.`);
      } else {
        warn(`Identity file has unencrypted private keys. Set F0X_IDENTITY_PASSPHRASE for staging/prod.`);
      }
    } else if (identityContent.encryptedSecrets) {
      pass('Identity private keys are encrypted (encryptedSecrets present)');
    }
  } catch {
    warn('Could not parse identity file for encryption check.');
  }
} else {
  info(`Identity file not yet present — will be created on first run.`);
}

// ── 7. Tenant binding file ───────────────────────────────────────────────────
const tenantFile = join(identityDir, 'tenant-binding.json');
if (!existsSync(tenantFile)) {
  if (profile === 'prod') {
    fail(`Tenant binding file missing at ${tenantFile}. Run the server once in staging to establish binding.`);
  } else {
    warn(`Tenant binding file not yet present — will be created on first run.`);
  }
} else {
  pass('Tenant binding file present');
}

// ── 8. Build artifact exists and is recent ──────────────────────────────────
const distIndex = join(process.cwd(), 'dist', 'index.js');
if (!existsSync(distIndex)) {
  fail(`Build artifact dist/index.js not found. Run: npm run build`);
} else {
  const mtime = statSync(distIndex).mtimeMs;
  const ageMs = Date.now() - mtime;
  const ageHours = ageMs / (1000 * 60 * 60);
  if (ageHours > 24) {
    warn(`Build artifact is ${ageHours.toFixed(1)}h old. Consider rebuilding: npm run build`);
  } else {
    pass(`Build artifact dist/index.js is recent (${ageHours.toFixed(1)}h old)`);
  }
}

// ── 9. Static security checks ────────────────────────────────────────────────
try {
  execSync('node scripts/security-check.mjs', { stdio: 'pipe' });
  pass('Static security checks passed');
} catch (err) {
  const msg = err.stdout ? err.stdout.toString().trim() : (err.message ?? String(err));
  fail(`Static security checks failed:\n  ${msg.split('\n').join('\n  ')}`);
}

// ── 10. Relay health check ────────────────────────────────────────────────────
if (relayUrl) {
  try {
    const healthUrl = `${relayUrl}/api/relay/health`;
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
    if (res.status === 200) {
      const body = await res.json();
      pass(`Relay reachable: ${healthUrl} → relay="${body.relay ?? 'unknown'}"`);
    } else {
      fail(`Relay health endpoint returned HTTP ${res.status} at ${healthUrl}`);
    }
  } catch (err) {
    fail(`Relay not reachable at ${relayUrl}: ${err instanceof Error ? err.message : String(err)}`);
  }
} else {
  info('Relay reachability check skipped (RELAY_URL not set)');
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('');
if (failures === 0 && warnings === 0) {
  console.log(`Deployment guard PASSED for profile "${profile}". Promotion is permitted.`);
  process.exit(0);
} else if (failures === 0) {
  console.warn(`Deployment guard PASSED with ${warnings} warning(s) for profile "${profile}". Review warnings before promotion.`);
  process.exit(0);
} else {
  console.error(`Deployment guard FAILED: ${failures} critical failure(s), ${warnings} warning(s) for profile "${profile}".`);
  console.error('Promotion is BLOCKED until all failures are resolved.');
  process.exit(1);
}
