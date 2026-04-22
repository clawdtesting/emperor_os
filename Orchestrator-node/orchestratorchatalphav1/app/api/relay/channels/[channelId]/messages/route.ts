import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/server/auth';
import { readStore, writeStore } from '@/lib/server/store';
import type { MessageEnvelope } from '@/lib/types/protocol';

export async function GET(_request: Request, context: { params: { channelId: string } }) {
  try {
    const { agentId } = await requireSession();
    const { channelId } = context.params;
    const store = await readStore();

    const channel = store.channels.find((entry) => entry.channelId === channelId);
    if (!channel) return NextResponse.json({ error: 'channel not found' }, { status: 404 });
    if (!channel.members.includes(agentId)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const messages = store.messages.filter((msg) => msg.channelId === channelId);
    return NextResponse.json({ channel, messages });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'auth failed' }, { status: 401 });
  }
}

export async function POST(request: Request, context: { params: { channelId: string } }) {
  try {
    const { agentId } = await requireSession();
    const { channelId } = context.params;
    const envelope = (await request.json()) as MessageEnvelope;
    const store = await readStore();

    if (envelope.senderAgentId !== agentId) {
      return NextResponse.json({ error: 'senderAgentId must match authenticated agent' }, { status: 403 });
    }

    const channel = store.channels.find((entry) => entry.channelId === channelId);
    if (!channel) return NextResponse.json({ error: 'channel not found' }, { status: 404 });
    if (!channel.members.includes(agentId)) {
      return NextResponse.json({ error: 'sender agent not in channel' }, { status: 403 });
    }

    const replayKey = `${channelId}:${envelope.senderAgentId}:${envelope.replayCounter}`;
    if (store.replayIndex.includes(replayKey)) {
      return NextResponse.json({ error: 'replay detected' }, { status: 409 });
    }

    if (store.messages.some((msg) => msg.messageId === envelope.messageId)) {
      return NextResponse.json({ error: 'duplicate messageId' }, { status: 409 });
    }

    store.messages.push(envelope);
    store.replayIndex.push(replayKey);
    await writeStore(store);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'auth failed' }, { status: 401 });
  }
}
