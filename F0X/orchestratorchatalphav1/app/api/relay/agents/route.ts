import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/server/auth';
import { getAgent } from '@/lib/relay/service';

// GET /api/relay/agents?agentId=<uuid>
// Returns a single agent profile — only if you share a channel with them, or it is yourself.
// No public directory: agentIds must be shared out-of-band to prevent enumeration and flooding.
export async function GET(request: Request) {
  try {
    const { agentId: requesterId } = await requireSession();
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');
    if (!agentId) {
      return NextResponse.json({ error: 'agentId query param required', code: 'INVALID' }, { status: 400 });
    }
    const agent = await getAgent(requesterId, agentId);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found or not accessible', code: 'NOT_FOUND' }, { status: 404 });
    }
    return NextResponse.json({ agent });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'auth failed', code: 'AUTH' },
      { status: 401 }
    );
  }
}
