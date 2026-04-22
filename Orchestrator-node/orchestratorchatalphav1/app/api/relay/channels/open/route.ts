import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/server/auth';
import { openDmChannel } from '@/lib/relay/service';
import type { WrappedChannelKey } from '@/lib/types/domain';

export async function POST(request: Request) {
  try {
    const { agentId } = await requireSession();
    const payload = (await request.json()) as {
      creatorAgentId?: string;
      targetAgentId?: string;
      wrappedKeys?: WrappedChannelKey[];
    };

    if (!payload.creatorAgentId || !payload.targetAgentId || !payload.wrappedKeys?.length) {
      return NextResponse.json(
        { error: 'creatorAgentId, targetAgentId, wrappedKeys required', code: 'INVALID' },
        { status: 400 }
      );
    }

    if (payload.creatorAgentId !== agentId) {
      return NextResponse.json(
        { error: 'authenticated agent must be the channel creator', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    const result = await openDmChannel(agentId, payload.targetAgentId, payload.wrappedKeys);
    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'failed';
    const status = msg.includes('not registered') ? 404 : msg.includes('auth') ? 401 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
