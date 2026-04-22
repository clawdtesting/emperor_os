import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/server/auth';
import { readStore } from '@/lib/server/store';

export async function GET() {
  try {
    const { agentId } = await requireSession();
    const store = await readStore();
    const channels = store.channels.filter((channel) => channel.members.includes(agentId));
    return NextResponse.json({ channels, myAgentIds: [agentId] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'auth failed' }, { status: 401 });
  }
}
