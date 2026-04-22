import { NextResponse } from 'next/server';
import { readStore } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const store = await readStore();
  return NextResponse.json({
    relay: 'ok',
    timestamp: new Date().toISOString(),
    stats: {
      agents: store.agents.length,
      channels: store.channels.length,
      envelopes: store.messages.length
    }
  });
}
