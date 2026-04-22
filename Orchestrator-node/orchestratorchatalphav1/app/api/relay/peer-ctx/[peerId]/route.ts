import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/server/auth';
import { readMemory, writeMemory } from '@/lib/server/memory';
import type { AgentMemory } from '@/lib/types/domain';

export async function GET(_request: Request, context: { params: { peerId: string } }) {
  try {
    const { agentId } = await requireSession();
    const memory = await readMemory(agentId, context.params.peerId);
    return NextResponse.json({ memory });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'auth failed' }, { status: 401 });
  }
}

export async function PUT(request: Request, context: { params: { peerId: string } }) {
  try {
    const { agentId } = await requireSession();
    const { peerId } = context.params;
    const body = (await request.json()) as Partial<AgentMemory>;
    const existing = await readMemory(agentId, peerId);

    const updated: AgentMemory = {
      myAgentId: agentId,
      peerAgentId: peerId,
      peerLabel: body.peerLabel ?? existing?.peerLabel ?? 'Unknown',
      lastSeen: new Date().toISOString(),
      messageCount: body.messageCount ?? existing?.messageCount ?? 0,
      summary: body.summary ?? existing?.summary ?? '',
      sharedFacts: body.sharedFacts ?? existing?.sharedFacts ?? [],
      updatedAt: new Date().toISOString()
    };

    await writeMemory(updated);
    return NextResponse.json({ memory: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'auth failed' }, { status: 401 });
  }
}
