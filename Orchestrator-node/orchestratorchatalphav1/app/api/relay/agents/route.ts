import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/server/auth';
import { readStore } from '@/lib/server/store';

export async function GET() {
  try {
    await requireSession();
    const store = await readStore();
    return NextResponse.json({ agents: store.agents });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'auth failed' }, { status: 401 });
  }
}
