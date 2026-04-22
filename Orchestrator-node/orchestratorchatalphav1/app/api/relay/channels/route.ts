import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/server/auth';
import { readStore } from '@/lib/server/store';

export async function GET() {
  try {
    const { wallet } = await requireSession();
    const store = await readStore();
    const myAgentIds = store.agents
      .filter((agent) => agent.ownerWallet.toLowerCase() === wallet.toLowerCase())
      .map((agent) => agent.agentId);

    const channels = store.channels.filter((channel) => channel.members.some((member) => myAgentIds.includes(member)));

    return NextResponse.json({ channels, myAgentIds });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'auth failed' }, { status: 401 });
  }
}
