import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/server/auth';
import { readStore, writeStore } from '@/lib/server/store';
import type { Channel, WrappedChannelKey } from '@/lib/types/domain';

function buildChannelId(a: string, b: string): string {
  const sorted = [a, b].sort().join(':');
  return createHash('sha256').update(`dm:${sorted}`).digest('hex').slice(0, 32);
}

export async function POST(request: Request) {
  try {
    const { agentId } = await requireSession();
    const payload = (await request.json()) as {
      creatorAgentId?: string;
      targetAgentId?: string;
      wrappedKeys?: WrappedChannelKey[];
    };

    if (!payload.creatorAgentId || !payload.targetAgentId || !payload.wrappedKeys?.length) {
      return NextResponse.json({ error: 'creatorAgentId, targetAgentId, wrappedKeys required' }, { status: 400 });
    }

    if (payload.creatorAgentId !== agentId) {
      return NextResponse.json({ error: 'authenticated agent must be the channel creator' }, { status: 403 });
    }

    const store = await readStore();
    const targetProfile = store.agents.find((agent) => agent.agentId === payload.targetAgentId);

    if (!targetProfile) {
      return NextResponse.json({ error: 'target agent must be a registered agent' }, { status: 404 });
    }

    const channelId = buildChannelId(payload.creatorAgentId, payload.targetAgentId);
    const existing = store.channels.find((channel) => channel.channelId === channelId);

    if (existing) {
      return NextResponse.json({ channel: existing, existed: true });
    }

    const channel: Channel = {
      channelId,
      kind: 'dm',
      members: [payload.creatorAgentId, payload.targetAgentId],
      wrappedKeys: payload.wrappedKeys.map((wrap) => ({ ...wrap, channelId })),
      createdBy: payload.creatorAgentId,
      createdAt: new Date().toISOString()
    };

    store.channels.push(channel);
    await writeStore(store);

    return NextResponse.json({ channel, existed: false });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'auth failed' }, { status: 401 });
  }
}
