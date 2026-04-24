#!/usr/bin/env node
import assert from 'node:assert/strict';

const BASE_URL = process.env['RELAY_URL'];
const AGENT_A_TOKEN = process.env['SECURITY_TEST_AGENT_A_TOKEN'];
const AGENT_B_TOKEN = process.env['SECURITY_TEST_AGENT_B_TOKEN'];
const AGENT_A_CHANNEL_ID = process.env['SECURITY_TEST_AGENT_A_CHANNEL_ID'];
const AGENT_B_CHANNEL_ID = process.env['SECURITY_TEST_AGENT_B_CHANNEL_ID'];
const VERIFY_LOGOUT = process.env['SECURITY_TEST_VERIFY_LOGOUT'] === '1';

if (!BASE_URL || !AGENT_A_TOKEN || !AGENT_B_TOKEN || !AGENT_A_CHANNEL_ID || !AGENT_B_CHANNEL_ID) {
  console.log('security:live skipped — set RELAY_URL + SECURITY_TEST_AGENT_* env vars to run live negative authz/replay checks.');
  process.exit(0);
}

async function expectDenied(path, token, label) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  assert([401, 403, 404].includes(res.status), `${label} expected denied status, got ${res.status}`);
  console.log(`[PASS] ${label}: denied with HTTP ${res.status}`);
}

async function run() {
  // Agent A should not read agent B channel.
  await expectDenied(
    `/api/relay/channels/${encodeURIComponent(AGENT_B_CHANNEL_ID)}/messages?limit=1`,
    AGENT_A_TOKEN,
    'cross-channel read denied'
  );

  // Agent B should not read agent A channel.
  await expectDenied(
    `/api/relay/channels/${encodeURIComponent(AGENT_A_CHANNEL_ID)}/messages?limit=1`,
    AGENT_B_TOKEN,
    'reverse cross-channel read denied'
  );

  // Channel enumeration should remain caller-scoped.
  const channelsRes = await fetch(`${BASE_URL}/api/relay/channels`, {
    headers: {
      Authorization: `Bearer ${AGENT_A_TOKEN}`
    }
  });
  assert.equal(channelsRes.status, 200, `list channels expected 200, got ${channelsRes.status}`);
  const body = await channelsRes.json();
  assert(Array.isArray(body.channels), 'channels response must include channels array');
  const leaked = body.channels.some((channel) => channel.channelId === AGENT_B_CHANNEL_ID);
  assert.equal(leaked, false, 'agent A listChannels leaked agent B channel');
  console.log('[PASS] channel enumeration scoped to authenticated tenant');

  // Adversarial oversized payload attempt should fail closed.
  const oversized = 'X'.repeat(128 * 1024);
  const oversizedRes = await fetch(`${BASE_URL}/api/relay/channels/${encodeURIComponent(AGENT_A_CHANNEL_ID)}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AGENT_A_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messageId: `sec-live-${Date.now()}`,
      channelId: AGENT_A_CHANNEL_ID,
      senderAgentId: 'security-live-check',
      timestamp: new Date().toISOString(),
      replayCounter: 999999,
      nonceB64: '',
      ciphertextB64: oversized,
      signatureB64: ''
    })
  });
  assert(oversizedRes.status >= 400, `oversized payload expected rejection, got ${oversizedRes.status}`);
  console.log(`[PASS] oversized payload rejected with HTTP ${oversizedRes.status}`);

  if (VERIFY_LOGOUT) {
    // Verify logout invalidates active bearer token.
    const logoutRes = await fetch(`${BASE_URL}/api/relay/auth/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AGENT_A_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    assert(logoutRes.status < 300, `logout expected success, got ${logoutRes.status}`);
    const postLogoutRes = await fetch(`${BASE_URL}/api/relay/channels`, {
      headers: {
        Authorization: `Bearer ${AGENT_A_TOKEN}`
      }
    });
    assert([401, 403].includes(postLogoutRes.status), `post-logout token expected denied, got ${postLogoutRes.status}`);
    console.log(`[PASS] logout invalidation verified: HTTP ${postLogoutRes.status} after logout`);
  } else {
    console.log('[INFO] logout invalidation check skipped (set SECURITY_TEST_VERIFY_LOGOUT=1 to enable)');
  }
}

run().then(() => {
  console.log('security:live checks passed.');
}).catch((err) => {
  console.error(`security:live failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
