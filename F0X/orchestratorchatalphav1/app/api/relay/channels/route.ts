import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/server/auth';
import { listChannels } from '@/lib/relay/service';

export async function GET() {
  try {
    const { agentId } = await requireSession();
    const channels = await listChannels(agentId);
    return NextResponse.json({ channels, myAgentIds: [agentId] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'auth failed', code: 'AUTH' },
      { status: 401 }
    );
  }
}
