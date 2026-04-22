import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/server/auth';
import { getMemory, setMemory } from '@/lib/relay/service';
import type { AgentMemory } from '@/lib/types/domain';

export async function GET(_request: Request, context: { params: { peerId: string } }) {
  try {
    const { agentId } = await requireSession();
    const mem = await getMemory(agentId, context.params.peerId);
    return NextResponse.json({ memory: mem });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'auth failed', code: 'AUTH' },
      { status: 401 }
    );
  }
}

export async function PUT(request: Request, context: { params: { peerId: string } }) {
  try {
    const { agentId } = await requireSession();
    const body = (await request.json()) as Partial<AgentMemory>;
    const updated = await setMemory(agentId, context.params.peerId, body);
    return NextResponse.json({ memory: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'auth failed', code: 'AUTH' },
      { status: 401 }
    );
  }
}
