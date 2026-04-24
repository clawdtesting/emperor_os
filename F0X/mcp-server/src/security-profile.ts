export type SecurityProfile = 'dev' | 'staging' | 'prod';

export interface SecurityProfileInput {
  profile: SecurityProfile;
  relayUrl: string;
  identityDirExplicitlySet: boolean;
  agentLabelExplicitlySet: boolean;
  operatorIdExplicitlySet: boolean;
}

export function resolveSecurityProfile(): SecurityProfile {
  const raw = (process.env['F0X_SECURITY_PROFILE'] ?? 'dev').toLowerCase();
  if (raw === 'dev' || raw === 'staging' || raw === 'prod') return raw;
  throw new Error(`Invalid F0X_SECURITY_PROFILE "${raw}". Expected dev|staging|prod.`);
}

export function enforceSecurityProfile(input: SecurityProfileInput): void {
  const { profile, relayUrl, identityDirExplicitlySet, agentLabelExplicitlySet, operatorIdExplicitlySet } = input;
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

  if (profile === 'prod') {
    if (isLocalhost) {
      throw new Error('Security profile "prod" does not allow localhost relay URLs.');
    }
    if (!agentLabelExplicitlySet) {
      throw new Error('Security profile "prod" requires AGENT_LABEL to be explicitly set.');
    }
  }
}
