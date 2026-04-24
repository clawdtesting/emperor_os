#!/usr/bin/env node
/**
 * Live security check suite — runs against a real relay with fixture agents.
 *
 * Required env vars (all must be present; no partial runs):
 *   RELAY_URL                          — relay base URL
 *   SECURITY_TEST_AGENT_A_TOKEN        — pre-authenticated bearer token for fixture agent A
 *   SECURITY_TEST_AGENT_B_TOKEN        — pre-authenticated bearer token for fixture agent B
 *   SECURITY_TEST_AGENT_A_CHANNEL_ID   — a channel that agent A is a member of
 *   SECURITY_TEST_AGENT_B_CHANNEL_ID   — a channel that agent B is a member of (not A's)
 *
 * Optional:
 *   SECURITY_TEST_AGENT_A_ID           — agentId for agent A (used for logout re-login test)
 *   SECURITY_TEST_SKIP_LOGOUT          — set to '1' to skip the logout revocation test
 *                                        (default: logout test is REQUIRED and will fail CI if absent)
 *
 * CI DEPLOYMENT NOTE:
 *   This suite must run in a dedicated nightly fixture environment where all
 *   secrets are always present. PRs touching relay/auth paths must pass this
 *   suite before merge (required status check). Test results are archived as
 *   artifacts for audit purposes.
 */
import assert from 'node:assert/strict';

const BASE_URL = process.env['RELAY_URL'];
const AGENT_A_TOKEN = process.env['SECURITY_TEST_AGENT_A_TOKEN'];
const AGENT_B_TOKEN = process.env['SECURITY_TEST_AGENT_B_TOKEN'];
const AGENT_A_CHANNEL_ID = process.env['SECURITY_TEST_AGENT_A_CHANNEL_ID'];
const AGENT_B_CHANNEL_ID = process.env['SECURITY_TEST_AGENT_B_CHANNEL_ID'];

// Logout revocation is now a REQUIRED test — operators must explicitly opt out.
const SKIP_LOGOUT = process.env['SECURITY_TEST_SKIP_LOGOUT'] === '1';

if (!BASE_URL || !AGENT_A_TOKEN || !AGENT_B_TOKEN || !AGENT_A_CHANNEL_ID || !AGENT_B_CHANNEL_ID) {
  console.error(
    'security:live FAILED — required env vars missing.\n' +
    'Set RELAY_URL + SECURITY_TEST_AGENT_A_TOKEN + SECURITY_TEST_AGENT_B_TOKEN +\n' +
    '    SECURITY_TEST_AGENT_A_CHANNEL_ID + SECURITY_TEST_AGENT_B_CHANNEL_ID\n\n' +
    'To run live checks, configure a dedicated fixture environment with all secrets present.\n' +
    'See .github/workflows/security-nightly.yml for the canonical setup.'
  );
  process.exit(1);
}

const results = [];

async function expectDenied(path, token, label) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert([401, 403, 404].includes(res.status), `${label} expected denied status, got ${res.status}`);
  results.push({ test: label, status: 'PASS', httpStatus: res.status });
  console.log(`[PASS] ${label}: denied with HTTP ${res.status}`);
}

async function run() {
  // ── 1. Cross-channel read isolation ─────────────────────────────────────────
  await expectDenied(
    `/api/relay/channels/${encodeURIComponent(AGENT_B_CHANNEL_ID)}/messages?limit=1`,
    AGENT_A_TOKEN,
    'cross-channel read denied (A→B channel)'
  );
  await expectDenied(
    `/api/relay/channels/${encodeURIComponent(AGENT_A_CHANNEL_ID)}/messages?limit=1`,
    AGENT_B_TOKEN,
    'cross-channel read denied (B→A channel)'
  );

  // ── 2. Channel enumeration scoping ──────────────────────────────────────────
  const channelsRes = await fetch(`${BASE_URL}/api/relay/channels`, {
    headers: { Authorization: `Bearer ${AGENT_A_TOKEN}` }
  });
  assert.equal(channelsRes.status, 200, `list channels expected 200, got ${channelsRes.status}`);
  const channelsBody = await channelsRes.json();
  assert(Array.isArray(channelsBody.channels), 'channels response must include channels array');
  const leaked = channelsBody.channels.some((ch) => ch.channelId === AGENT_B_CHANNEL_ID);
  assert.equal(leaked, false, 'agent A listChannels leaked agent B channel');
  results.push({ test: 'channel enumeration scoped to tenant', status: 'PASS' });
  console.log('[PASS] channel enumeration scoped to authenticated tenant');

  // ── 3. Payload size boundary tests ─────────────────────────────────────────
  // 3a. Just-below limit (63 KB) should succeed or return a non-5xx
  const justBelow = 'X'.repeat(63 * 1024);
  const justBelowRes = await fetch(
    `${BASE_URL}/api/relay/channels/${encodeURIComponent(AGENT_A_CHANNEL_ID)}/messages`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${AGENT_A_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messageId: `sec-live-below-${Date.now()}`,
        channelId: AGENT_A_CHANNEL_ID,
        senderAgentId: 'security-live-check',
        timestamp: new Date().toISOString(),
        replayCounter: 1,
        nonceB64: '',
        ciphertextB64: justBelow,
        signatureB64: ''
      })
    }
  );
  // Expect rejection (bad signature/nonce) but NOT 5xx gateway error
  assert(justBelowRes.status < 500, `just-below limit expected non-5xx, got ${justBelowRes.status}`);
  results.push({ test: 'payload just-below limit', status: 'PASS', httpStatus: justBelowRes.status });
  console.log(`[PASS] payload just-below limit: HTTP ${justBelowRes.status}`);

  // 3b. At-limit (64 KB) should be rejected or return non-5xx
  const atLimit = 'X'.repeat(64 * 1024);
  const atLimitRes = await fetch(
    `${BASE_URL}/api/relay/channels/${encodeURIComponent(AGENT_A_CHANNEL_ID)}/messages`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${AGENT_A_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messageId: `sec-live-at-${Date.now()}`,
        channelId: AGENT_A_CHANNEL_ID,
        senderAgentId: 'security-live-check',
        timestamp: new Date().toISOString(),
        replayCounter: 2,
        nonceB64: '',
        ciphertextB64: atLimit,
        signatureB64: ''
      })
    }
  );
  assert(atLimitRes.status < 500, `at-limit expected non-5xx, got ${atLimitRes.status}`);
  results.push({ test: 'payload at limit', status: 'PASS', httpStatus: atLimitRes.status });
  console.log(`[PASS] payload at limit: HTTP ${atLimitRes.status}`);

  // 3c. Over-limit (128 KB) must be rejected with 4xx
  const oversized = 'X'.repeat(128 * 1024);
  const oversizedRes = await fetch(
    `${BASE_URL}/api/relay/channels/${encodeURIComponent(AGENT_A_CHANNEL_ID)}/messages`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${AGENT_A_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messageId: `sec-live-over-${Date.now()}`,
        channelId: AGENT_A_CHANNEL_ID,
        senderAgentId: 'security-live-check',
        timestamp: new Date().toISOString(),
        replayCounter: 999999,
        nonceB64: '',
        ciphertextB64: oversized,
        signatureB64: ''
      })
    }
  );
  assert(oversizedRes.status >= 400, `oversized payload expected rejection, got ${oversizedRes.status}`);
  results.push({ test: 'oversized payload rejected', status: 'PASS', httpStatus: oversizedRes.status });
  console.log(`[PASS] oversized payload rejected with HTTP ${oversizedRes.status}`);

  // ── 4. Unauthenticated access ────────────────────────────────────────────────
  const noAuthRes = await fetch(
    `${BASE_URL}/api/relay/channels/${encodeURIComponent(AGENT_A_CHANNEL_ID)}/messages?limit=1`
  );
  assert([401, 403].includes(noAuthRes.status), `no-auth expected 401/403, got ${noAuthRes.status}`);
  results.push({ test: 'unauthenticated access denied', status: 'PASS', httpStatus: noAuthRes.status });
  console.log(`[PASS] unauthenticated access denied: HTTP ${noAuthRes.status}`);

  // ── 5. Token revocation — REQUIRED ──────────────────────────────────────────
  if (SKIP_LOGOUT) {
    results.push({ test: 'token revocation', status: 'SKIPPED', reason: 'SECURITY_TEST_SKIP_LOGOUT=1' });
    console.warn('[WARN] Token revocation test SKIPPED (SECURITY_TEST_SKIP_LOGOUT=1).');
    console.warn('[WARN] This test MUST be enabled in nightly CI to satisfy the security contract.');
  } else {
    // 5a. Verify the token works pre-logout
    const preLogoutRes = await fetch(`${BASE_URL}/api/relay/channels`, {
      headers: { Authorization: `Bearer ${AGENT_A_TOKEN}` }
    });
    assert.equal(preLogoutRes.status, 200, `pre-logout token expected 200, got ${preLogoutRes.status}`);
    results.push({ test: 'token valid pre-logout', status: 'PASS', httpStatus: preLogoutRes.status });
    console.log('[PASS] token valid pre-logout');

    // 5b. Logout must succeed
    const logoutRes = await fetch(`${BASE_URL}/api/relay/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${AGENT_A_TOKEN}`, 'Content-Type': 'application/json' }
    });
    assert(logoutRes.status < 300, `logout expected success, got ${logoutRes.status}`);
    results.push({ test: 'logout succeeds', status: 'PASS', httpStatus: logoutRes.status });
    console.log(`[PASS] logout succeeded: HTTP ${logoutRes.status}`);

    // 5c. Same token must be immediately invalid post-logout
    const postLogoutRes = await fetch(`${BASE_URL}/api/relay/channels`, {
      headers: { Authorization: `Bearer ${AGENT_A_TOKEN}` }
    });
    assert(
      [401, 403].includes(postLogoutRes.status),
      `post-logout token expected 401/403, got ${postLogoutRes.status}`
    );
    results.push({ test: 'token invalid post-logout (revocation)', status: 'PASS', httpStatus: postLogoutRes.status });
    console.log(`[PASS] token revoked immediately post-logout: HTTP ${postLogoutRes.status}`);
  }

  // ── 6. Health endpoint ───────────────────────────────────────────────────────
  const healthRes = await fetch(`${BASE_URL}/api/relay/health`);
  assert.equal(healthRes.status, 200, `health expected 200, got ${healthRes.status}`);
  const healthBody = await healthRes.json();
  assert(typeof healthBody.relay === 'string', 'health.relay must be a string');
  results.push({ test: 'health endpoint responsive', status: 'PASS' });
  console.log('[PASS] health endpoint responsive');

  // ── 7. Config/limits endpoint (optional — relay may not expose it yet) ───────
  const configRes = await fetch(`${BASE_URL}/api/relay/config`, {
    headers: { Authorization: `Bearer ${AGENT_B_TOKEN}` }
  });
  if (configRes.status === 200) {
    const configBody = await configRes.json();
    if (typeof configBody.maxCiphertextBytes === 'number') {
      assert(
        configBody.maxCiphertextBytes <= 128 * 1024,
        `relay maxCiphertextBytes too large: ${configBody.maxCiphertextBytes}`
      );
      results.push({ test: 'relay config limits sane', status: 'PASS' });
      console.log(`[PASS] relay config: maxCiphertextBytes=${configBody.maxCiphertextBytes}`);
    }
  } else {
    results.push({ test: 'relay config endpoint', status: 'SKIPPED', reason: `HTTP ${configRes.status}` });
    console.log(`[INFO] relay /api/relay/config not yet exposed (HTTP ${configRes.status}) — skipped`);
  }
}

run().then(() => {
  const passed = results.filter((r) => r.status === 'PASS').length;
  const skipped = results.filter((r) => r.status === 'SKIPPED').length;
  console.log(`\nsecurity:live checks complete: ${passed} passed, ${skipped} skipped.`);
  // Emit JSON summary for artifact archiving
  process.stdout.write(JSON.stringify({ summary: { passed, skipped, total: results.length }, results }, null, 2) + '\n');
}).catch((err) => {
  console.error(`security:live FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
