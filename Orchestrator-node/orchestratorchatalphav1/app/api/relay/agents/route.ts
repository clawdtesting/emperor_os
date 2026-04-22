import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/server/auth';
import { listAgents } from '@/lib/relay/service';

export async function GET() {
  try {
    await requireSession();
    const agents = await listAgents();
    return NextResponse.json({ agents });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'auth failed', code: 'AUTH' },
      { status: 401 }
    );
  }
}
