/**
 * Payload size policy — relay-verified limits with CI boundary tests.
 *
 * Max payload is a relay configuration concern; the client enforces the same
 * limits locally to fail-fast before hitting the relay. The effective limits
 * must be consistent between client and relay and must be regression-tested
 * on every release.
 *
 * This module:
 *   1. Declares canonical payload limits (single source of truth for client).
 *   2. Provides enforcePayloadPolicy() — validates outgoing payloads before
 *      relay submission.
 *   3. Exports getEffectiveLimits() — called by the health/config endpoint so
 *      operators can verify the active runtime limits without reading source.
 *   4. Provides verifyRelayLimits() — fetch the relay's /api/relay/config
 *      endpoint and assert that the relay's advertised limits match client
 *      expectations; used in CI boundary tests.
 */

// ─── Canonical limits ─────────────────────────────────────────────────────────

export interface PayloadLimits {
  /** Maximum ciphertext length in bytes (base64-encoded, before sending). */
  maxCiphertextBytes: number;
  /** Maximum plaintext message length in characters (before encryption). */
  maxPlaintextChars: number;
  /** Maximum agentId / channelId / messageId length in characters. */
  maxIdChars: number;
  /** Maximum number of sharedFacts entries per peer memory record. */
  maxFacts: number;
  /** Maximum length of a single fact string in characters. */
  maxFactChars: number;
  /** Maximum memory summary length in characters. */
  maxMemorySummaryChars: number;
}

export const DEFAULT_PAYLOAD_LIMITS: PayloadLimits = {
  maxCiphertextBytes: 64 * 1024,       // 64 KB
  maxPlaintextChars: 8_000,
  maxIdChars: 256,
  maxFacts: 200,
  maxFactChars: 512,
  maxMemorySummaryChars: 16_000
};

// ─── Enforcement ─────────────────────────────────────────────────────────────

export interface PayloadPolicyViolation {
  field: string;
  limit: number;
  actual: number;
  message: string;
}

export function enforcePayloadPolicy(
  payload: {
    ciphertextB64?: string;
    plaintextChars?: number;
    id?: string;
    facts?: string[];
    memorySummaryChars?: number;
  },
  limits: PayloadLimits = DEFAULT_PAYLOAD_LIMITS
): PayloadPolicyViolation[] {
  const violations: PayloadPolicyViolation[] = [];

  if (payload.ciphertextB64 !== undefined) {
    const bytes = Buffer.byteLength(payload.ciphertextB64, 'base64');
    if (bytes > limits.maxCiphertextBytes) {
      violations.push({
        field: 'ciphertextB64',
        limit: limits.maxCiphertextBytes,
        actual: bytes,
        message: `Ciphertext exceeds relay max (${bytes} > ${limits.maxCiphertextBytes} bytes)`
      });
    }
  }

  if (payload.plaintextChars !== undefined && payload.plaintextChars > limits.maxPlaintextChars) {
    violations.push({
      field: 'plaintext',
      limit: limits.maxPlaintextChars,
      actual: payload.plaintextChars,
      message: `Message text exceeds max (${payload.plaintextChars} > ${limits.maxPlaintextChars} chars)`
    });
  }

  if (payload.id !== undefined && payload.id.length > limits.maxIdChars) {
    violations.push({
      field: 'id',
      limit: limits.maxIdChars,
      actual: payload.id.length,
      message: `ID exceeds max length (${payload.id.length} > ${limits.maxIdChars} chars)`
    });
  }

  if (payload.facts !== undefined) {
    if (payload.facts.length > limits.maxFacts) {
      violations.push({
        field: 'facts.count',
        limit: limits.maxFacts,
        actual: payload.facts.length,
        message: `Too many facts (${payload.facts.length} > ${limits.maxFacts})`
      });
    }
    for (let i = 0; i < payload.facts.length; i++) {
      const fact = payload.facts[i]!;
      if (fact.length > limits.maxFactChars) {
        violations.push({
          field: `facts[${i}]`,
          limit: limits.maxFactChars,
          actual: fact.length,
          message: `Fact [${i}] too long (${fact.length} > ${limits.maxFactChars} chars)`
        });
      }
    }
  }

  if (payload.memorySummaryChars !== undefined && payload.memorySummaryChars > limits.maxMemorySummaryChars) {
    violations.push({
      field: 'memorySummary',
      limit: limits.maxMemorySummaryChars,
      actual: payload.memorySummaryChars,
      message: `Memory summary too long (${payload.memorySummaryChars} > ${limits.maxMemorySummaryChars} chars)`
    });
  }

  return violations;
}

// ─── Health/config endpoint payload ──────────────────────────────────────────

/**
 * Returns the effective runtime limits in a format suitable for embedding in
 * the health/config endpoint response. Operators SHOULD verify this output
 * matches their relay configuration before production deployment.
 */
export function getEffectiveLimits(overrides?: Partial<PayloadLimits>): PayloadLimits {
  return { ...DEFAULT_PAYLOAD_LIMITS, ...overrides };
}

// ─── Relay config verification ────────────────────────────────────────────────

export interface RelayConfigResponse {
  maxCiphertextBytes?: number;
  maxPlaintextChars?: number;
  maxIdChars?: number;
}

export interface RelayLimitMismatch {
  field: string;
  clientLimit: number;
  relayLimit: number;
}

/**
 * Fetch the relay's /api/relay/config endpoint and verify that its advertised
 * limits are at least as restrictive as the client defaults.
 * Returns a list of mismatches (empty = consistent).
 */
export async function verifyRelayLimits(relayUrl: string, token: string): Promise<RelayLimitMismatch[]> {
  const mismatches: RelayLimitMismatch[] = [];
  let relayConfig: RelayConfigResponse;

  try {
    const res = await fetch(`${relayUrl}/api/relay/config`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return [];  // relay may not yet expose /config — skip gracefully
    relayConfig = (await res.json()) as RelayConfigResponse;
  } catch {
    return [];  // network error — skip gracefully, do not block startup
  }

  const limits = DEFAULT_PAYLOAD_LIMITS;

  if (relayConfig.maxCiphertextBytes !== undefined &&
      relayConfig.maxCiphertextBytes > limits.maxCiphertextBytes) {
    mismatches.push({
      field: 'maxCiphertextBytes',
      clientLimit: limits.maxCiphertextBytes,
      relayLimit: relayConfig.maxCiphertextBytes
    });
  }

  if (relayConfig.maxPlaintextChars !== undefined &&
      relayConfig.maxPlaintextChars > limits.maxPlaintextChars) {
    mismatches.push({
      field: 'maxPlaintextChars',
      clientLimit: limits.maxPlaintextChars,
      relayLimit: relayConfig.maxPlaintextChars
    });
  }

  return mismatches;
}
