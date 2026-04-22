import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/server/auth';
import { listMessages, sendMessage } from '@/lib/relay/service';
import type { MessageEnvelope, PaginationCursor } from '@/lib/types/protocol';

export async function GET(request: Request, context: { params: { channelId: string } }) {
  try {
    const { agentId } = await requireSession();
    const { channelId } = context.params;
    const { searchParams } = new URL(request.url);

    const cursor: PaginationCursor = {};
    const before = searchParams.get('before');
    const limit = searchParams.get('limit');
    if (before) cursor.before = before;
    if (limit) cursor.limit = Math.min(parseInt(limit, 10), 200);

    const result = await listMessages(agentId, channelId, cursor);
    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'failed';
    const status = msg.includes('not found') ? 404 : msg.includes('Forbidden') ? 403 : 401;
    return NextResponse.json({ error: msg, code: 'AUTH' }, { status });
  }
}

export async function POST(request: Request, context: { params: { channelId: string } }) {
  try {
    const { agentId } = await requireSession();
    const { channelId } = context.params;
    const envelope = (await request.json()) as MessageEnvelope;

    await sendMessage(agentId, channelId, envelope);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'failed';
    const code = msg.includes('Replay') ? 'REPLAY' : msg.includes('Duplicate') ? 'DUPLICATE' : msg.includes('Forbidden') ? 'FORBIDDEN' : 'AUTH';
    const status = msg.includes('not found') ? 404 : msg.includes('Forbidden') ? 403 : msg.includes('Replay') || msg.includes('Duplicate') ? 409 : 401;
    return NextResponse.json({ error: msg, code }, { status });
  }
}
