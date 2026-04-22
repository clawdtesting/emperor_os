import { NextResponse } from 'next/server';
import { buildChallengeMessage, upsertChallenge } from '@/lib/server/auth';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get('agentId');

  if (!agentId) return NextResponse.json({ error: 'agentId query param required' }, { status: 400 });

  const { nonce } = await upsertChallenge(agentId);
  return NextResponse.json({ nonce, message: buildChallengeMessage(agentId, nonce) });
}
