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

  // ── New controls ─────────────────────────────────────────────────────────────

  // Item 1: Relay metadata minimization module exists with padding support.
  mustExist(
    'src/metadata-minimization.ts',
    'relay metadata minimization module'
  );
  mustContain(
    'src/metadata-minimization.ts',
    /padPlaintext/,
    'payload padding function present in metadata-minimization'
  );
  mustContain(
    'src/metadata-minimization.ts',
    /startCoverTraffic/,
    'cover traffic function present in metadata-minimization'
  );
  mustContain(
    'src/metadata-minimization.ts',
    /getChannelPolicy/,
    'channel sensitivity policy function present in metadata-minimization'
  );

  // Item 2: Token revocation — logout must be tested pre/post in live suite.
  mustContain(
    'scripts/security-live-check.mjs',
    /token valid pre-logout/,
    'live check verifies token works pre-logout'
  );
  mustContain(
    'scripts/security-live-check.mjs',
    /token invalid post-logout|revocation/,
    'live check verifies token is invalid post-logout (revocation)'
  );
  mustContain(
    'scripts/security-live-check.mjs',
    /SECURITY_TEST_SKIP_LOGOUT/,
    'live check has explicit opt-out guard for logout revocation test'
  );

  // Item 3: SSE sequencer module exists with reconciliation support.
  mustExist(
    'src/sse-sequencer.ts',
    'SSE sequencer module'
  );
  mustContain(
    'src/sse-sequencer.ts',
    /SseSequencer/,
    'SseSequencer class present'
  );
  mustContain(
    'src/sse-sequencer.ts',
    /reconcileAfterReconnect/,
    'SSE reconciliation helper present'
  );
  mustContain(
    'src/sse-sequencer.ts',
    /gapAlertThreshold|alertGap/,
    'SSE gap alerting present'
  );

  // Item 4: Integration policy module exists with denylist + conformance check.
  mustExist(
    'src/integration-policy.ts',
    'integration policy module'
  );
  mustContain(
    'src/integration-policy.ts',
    /FIXED_PROMPT_BOUNDARY_TEMPLATE/,
    'prompt boundary template present in integration-policy'
  );
  mustContain(
    'src/integration-policy.ts',
    /ROLE_OVERRIDE_DENYLIST/,
    'role override denylist present in integration-policy'
  );
  mustContain(
    'src/integration-policy.ts',
    /RED_TEAM_CORPUS/,
    'red-team corpus present in integration-policy'
  );
  mustContain(
    'src/integration-policy.ts',
    /verifyRedTeamCorpus/,
    'verifyRedTeamCorpus function present in integration-policy'
  );

  // Item 5: Passphrase entropy validation in security profile.
  mustContain(
    'src/security-profile.ts',
    /validatePassphraseStrength/,
    'passphrase entropy validation function present in security-profile'
  );
  mustContain(
    'src/security-profile.ts',
    /MIN_PASSPHRASE_LENGTH/,
    'minimum passphrase length constant present in security-profile'
  );

  // Item 6: Abuse detection module exists with quarantine support.
  mustExist(
    'src/abuse-detection.ts',
    'abuse detection module'
  );
  mustContain(
    'src/abuse-detection.ts',
    /AbuseDetector/,
    'AbuseDetector class present'
  );
  mustContain(
    'src/abuse-detection.ts',
    /QUARANTINE_THRESHOLD/,
    'quarantine threshold constant present in abuse-detection'
  );
  mustContain(
    'src/abuse-detection.ts',
    /abuseAuditPath|abuse-audit\.log/,
    'separate abuse audit log path present in abuse-detection'
  );

  // Item 7: Payload policy module with limit enforcement and relay verification.
  mustExist(
    'src/payload-policy.ts',
    'payload policy module'
  );
  mustContain(
    'src/payload-policy.ts',
    /DEFAULT_PAYLOAD_LIMITS/,
    'default payload limits constant present in payload-policy'
  );
  mustContain(
    'src/payload-policy.ts',
    /enforcePayloadPolicy/,
    'enforcePayloadPolicy function present in payload-policy'
  );
  mustContain(
    'src/payload-policy.ts',
    /verifyRelayLimits/,
    'verifyRelayLimits function present for relay config verification'
  );
  mustContain(
    'src/payload-policy.ts',
    /getEffectiveLimits/,
    'getEffectiveLimits exported for health/config endpoint'
  );

  // Item 8: Nightly CI workflow exists.
  mustExist(
    '.github/workflows/security-nightly.yml',
    'nightly security CI workflow'
  );
  mustContain(
    '.github/workflows/security-nightly.yml',
    /retention-days:\s*90/,
    'live security test results archived for 90 days'
  );
  mustContain(
    '.github/workflows/security-nightly.yml',
    /SECURITY_TEST_SKIP_LOGOUT.*'0'/,
    'nightly workflow enforces logout revocation test (no skip)'
  );

  // Item 9: Deployment guard script exists with machine-verifiable checks.
  mustExist(
    'scripts/deployment-guard.mjs',
    'deployment guard script'
  );
  mustContain(
    'scripts/deployment-guard.mjs',
    /validatePassphraseStrength|MIN_LEN|uniqueChars/,
    'deployment guard validates passphrase entropy'
  );
  mustContain(
    'scripts/deployment-guard.mjs',
    /identity.*directory.*permissions|dirMode/,
    'deployment guard checks identity directory permissions'
  );
  mustContain(
    'scripts/deployment-guard.mjs',
    /relay.*reachable|api\/relay\/health/,
    'deployment guard verifies relay reachability'
  );
  mustContain(
    'scripts/deployment-guard.mjs',
    /security-check\.mjs/,
    'deployment guard runs static security checks'
  );

  console.log('Security checks passed.');
}

try {
  run();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
