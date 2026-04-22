import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/server/auth';
import { readStore, writeStore } from '@/lib/server/store';
import type { MessageEnvelope } from '@/lib/types/protocol';

export async function GET(_request: Request, context: { params: { channelId: string } }) {
  try {
    const { wallet } = await requireSession();
    const { channelId } = context.params;
    const store = await readStore();

    const myAgentIds = store.agents
      .filter((agent) => agent.ownerWallet.toLowerCase() === wallet.toLowerCase())
      .map((agent) => agent.agentId);

    const channel = store.channels.find((entry) => entry.channelId === channelId);
    if (!channel) return NextResponse.json({ error: 'channel not found' }, { status: 404 });

    const allowed = channel.members.some((member) => myAgentIds.includes(member));
    if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const messages = store.messages.filter((msg) => msg.channelId === channelId);
    return NextResponse.json({ channel, messages });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'auth failed' }, { status: 401 });
  }
}

export async function POST(request: Request, context: { params: { channelId: string } }) {
  try {
    const { wallet } = await requireSession();
    const { channelId } = context.params;
    const envelope = (await request.json()) as MessageEnvelope;
    const store = await readStore();

    const agent = store.agents.find((entry) => entry.agentId === envelope.senderAgentId);
    if (!agent) return NextResponse.json({ error: 'sender agent not registered' }, { status: 404 });
    if (agent.ownerWallet.toLowerCase() !== wallet.toLowerCase()) {
      return NextResponse.json({ error: 'wallet does not own sender agent' }, { status: 403 });
    }

    const channel = store.channels.find((entry) => entry.channelId === channelId);
    if (!channel) return NextResponse.json({ error: 'channel not found' }, { status: 404 });
    if (!channel.members.includes(envelope.senderAgentId)) {
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
