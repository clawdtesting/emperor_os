#!/usr/bin/env node
/**
 * Static security check — run before publish and in CI.
 * Verifies critical security controls are present in source files.
 * Exit 1 if any check fails.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

function mustContain(file, pattern, description) {
  const full = join(ROOT, file);
  const content = readFileSync(full, 'utf8');
  if (!pattern.test(content)) {
    throw new Error(`Security check failed: ${description} (${file})`);
  }
}

function mustExist(file, description) {
  if (!existsSync(join(ROOT, file))) {
    throw new Error(`Security check failed: ${description} — file not found: ${file}`);
  }
}

function run() {
  // ── Existing controls ────────────────────────────────────────────────────────

  // Prompt-injection containment: non-TTY confirm must auto-deny.
  mustContain(
    'src/tools.ts',
    /F0X_confirm_action called in non-TTY mode — auto-denied/,
    'non-TTY auto-deny guard for F0X_confirm_action'
  );

  // Crypto trust boundary: verify signature before decrypt in F0X_read.
  mustContain(
    'src/tools.ts',
    /if \(!signatureValid\)\s*{\s*recordSignatureFailure[\s\S]*Refusing to decrypt untrusted envelope/,
    'signature verification gate before decryption in F0X_read'
  );

  // Auth/authz behavior: 401/403 must trigger explicit auth error type.
  mustContain(
    'src/relay-client.ts',
    /if \(res\.status === 401 \|\| res\.status === 403\)[\s\S]*RelayAuthError/,
    'relay 401/403 typed auth failure handling'
  );

  // Flood handling: 429 must be explicit and non-silent.
  mustContain(
    'src/relay-client.ts',
    /if \(res\.status === 429\)[\s\S]*RelayRateLimitError/,
    'relay 429 typed rate-limit handling'
  );

  // Continuity boundary: no silent identity regeneration when continuity exists.
  mustContain(
    'src/identity.ts',
    /Refusing to silently regenerate identity/,
    'identity continuity fail-closed behavior'
  );

  // Recovery boundary: pending send journal must exist.
  mustContain(
    'src/send-recovery.ts',
    /markSendPending[\s\S]*status: 'pending'/,
    'pending send journaling before relay side effect'
  );

  mustContain(
    'src/index.ts',
    /enforceTenantBinding/,
    'tenant binding enforcement at runtime startup'
  );

  // Replay hardening: bounded signed timestamp skew validation is enforced.
  mustContain(
    'src/tools.ts',
    /validateSignedTimestamp\(env\.timestamp/,
    'signed envelope timestamp skew validation in MCP read path'
  );

  mustContain(
    'src/relay-client.ts',
    /return `\$\{this\.baseUrl\}\/api\/relay\/events`;/,
    'SSE URL must not include bearer token query parameter'
  );

  mustContain(
    'src/cli.ts',
    /execFile\('open', \[url\]\)|execFile\('xdg-open', \[url\]\)/,
    'browser launcher must use execFile with argument arrays'
  );

  mustContain(
    'src/security-profile.ts',
    /if \(profile === 'prod' \|\| profile === 'staging'\)[\s\S]*F0X_IDENTITY_PASSPHRASE/,
    'staging/prod passphrase enforcement in security profile'
  );

  mustContain(
    'src/tools.ts',
    /enforceApprovalPolicy\(ctx, 'F0X_send'/,
    'non-dev side-effect approval gate for send'
  );

  console.log('Security checks passed.');
}

try {
  run();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
