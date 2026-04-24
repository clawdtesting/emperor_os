export type SecurityProfile = 'dev' | 'staging' | 'prod';

export interface SecurityProfileInput {
  profile: SecurityProfile;
  relayUrl: string;
  identityDirExplicitlySet: boolean;
  agentLabelExplicitlySet: boolean;
  operatorIdExplicitlySet: boolean;
  identityPassphraseSet: boolean;
  /** Raw passphrase value for entropy validation (not stored or logged). */
  identityPassphrase?: string;
}

// ─── Passphrase entropy ───────────────────────────────────────────────────────

const MIN_PASSPHRASE_LENGTH = 20;
const MIN_UNIQUE_CHARS = 8;

/**
 * Validate passphrase strength for staging/prod.
 * Returns a list of policy failures (empty = accepted).
 *
 * Policy (minimum bar — operators should enforce stronger):
 *   - At least 20 characters
 *   - At least 8 distinct characters (prevents trivial repetition)
 *   - Must not be sourced from a known-weak list (env var name itself, etc.)
 */
export function validatePassphraseStrength(passphrase: string): string[] {
  const failures: string[] = [];
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    failures.push(
      `F0X_IDENTITY_PASSPHRASE is too short (${passphrase.length} chars). ` +
      `Minimum for staging/prod: ${MIN_PASSPHRASE_LENGTH} characters.`
    );
  }
  const uniqueChars = new Set(passphrase).size;
  if (uniqueChars < MIN_UNIQUE_CHARS) {
    failures.push(
      `F0X_IDENTITY_PASSPHRASE has too few distinct characters (${uniqueChars}). ` +
      `Minimum: ${MIN_UNIQUE_CHARS} unique characters.`
    );
  }
  const trivial = ['password', 'passphrase', 'secret', 'f0x', 'f0x-chat', 'changeme', '12345678901234567890'];
  for (const weak of trivial) {
    if (passphrase.toLowerCase().includes(weak)) {
      failures.push(`F0X_IDENTITY_PASSPHRASE contains a known-weak pattern: "${weak}".`);
      break;
    }
  }
  return failures;
}

export function resolveSecurityProfile(): SecurityProfile {
  const raw = (process.env['F0X_SECURITY_PROFILE'] ?? 'dev').toLowerCase();
  if (raw === 'dev' || raw === 'staging' || raw === 'prod') return raw;
  throw new Error(`Invalid F0X_SECURITY_PROFILE "${raw}". Expected dev|staging|prod.`);
}

export function enforceSecurityProfile(input: SecurityProfileInput): void {
  const { profile, relayUrl, identityDirExplicitlySet, agentLabelExplicitlySet, operatorIdExplicitlySet, identityPassphraseSet } = input;
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(relayUrl);
  const isHttps = relayUrl.startsWith('https://');

  if (profile === 'dev') return;

  if (!isHttps && !isLocalhost) {
    throw new Error(`Security profile "${profile}" requires HTTPS relay URL for non-localhost endpoints.`);
  }

  if (!identityDirExplicitlySet) {
    throw new Error(`Security profile "${profile}" requires AGENT_IDENTITY_DIR to be explicitly set.`);
  }
  if (!operatorIdExplicitlySet) {
    throw new Error(`Security profile "${profile}" requires F0X_OPERATOR_ID to be explicitly set.`);
  }

  if (profile === 'prod' || profile === 'staging') {
    if (!identityPassphraseSet) {
      throw new Error(`Security profile "${profile}" requires F0X_IDENTITY_PASSPHRASE for encrypted key storage.`);
    }
    if (input.identityPassphrase) {
      const weaknesses = validatePassphraseStrength(input.identityPassphrase);
      if (weaknesses.length > 0) {
        throw new Error(
          `Security profile "${profile}" passphrase policy violations:\n` +
          weaknesses.map((w) => `  - ${w}`).join('\n')
        );
      }
    }
  }

  if (profile === 'prod') {
    if (isLocalhost) {
      throw new Error('Security profile "prod" does not allow localhost relay URLs.');
    }
    if (!agentLabelExplicitlySet) {
      throw new Error('Security profile "prod" requires AGENT_LABEL to be explicitly set.');
    }
    if (!identityPassphraseSet) {
      throw new Error('Security profile "prod" requires F0X_IDENTITY_PASSPHRASE for encrypted key storage.');
    }
  }
}
