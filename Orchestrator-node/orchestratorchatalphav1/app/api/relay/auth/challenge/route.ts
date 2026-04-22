import { NextResponse } from 'next/server';
import { buildChallengeMessage, upsertChallenge } from '@/lib/server/auth';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get('wallet') as `0x${string}` | null;

  if (!wallet) return NextResponse.json({ error: 'wallet query param required' }, { status: 400 });

  const { nonce } = await upsertChallenge(wallet);
  return NextResponse.json({ nonce, message: buildChallengeMessage(wallet, nonce) });
}
