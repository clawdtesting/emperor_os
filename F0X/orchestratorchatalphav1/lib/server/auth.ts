/**
 * Next.js-specific auth helpers.
 * Wraps service layer functions to extract tokens from Next.js request headers.
 */

import { headers } from 'next/headers';
import { verifyToken } from '@/lib/relay/service';

export async function requireSession(): Promise<{ agentId: string }> {
  const headerMap = headers();
  const auth = headerMap.get('authorization');
  if (!auth?.startsWith('Bearer ')) throw new Error('Missing bearer token.');
  const token = auth.replace('Bearer ', '').trim();
  return verifyToken(token);
}

// Re-export service layer helpers used by routes
export { buildChallengeMessage, createChallenge, loginWithAgentKey } from '@/lib/relay/service';
