import { NextResponse } from 'next/server';
import { createChallenge } from '@/lib/relay/service';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get('agentId');
  if (!agentId) return NextResponse.json({ error: 'agentId query param required', code: 'INVALID' }, { status: 400 });

  try {
    const result = await createChallenge(agentId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'failed' }, { status: 500 });
  }
}
