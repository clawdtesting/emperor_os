import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/server/auth';
import { readStore, writeStore } from '@/lib/server/store';
import type { AgentProfile } from '@/lib/types/domain';

export async function POST(request: Request) {
  try {
    const { agentId } = await requireSession();
    const profile = (await request.json()) as AgentProfile;

    if (!profile.agentId || !profile.label || !profile.signingPublicKey || !profile.encryptionPublicKey) {
      return NextResponse.json({ error: 'invalid profile payload' }, { status: 400 });
    }

    if (profile.agentId !== agentId) {
      return NextResponse.json({ error: 'profile agentId must match authenticated agent' }, { status: 403 });
    }

    const store = await readStore();
    const existingIndex = store.agents.findIndex((entry) => entry.agentId === profile.agentId);

    if (existingIndex >= 0) {
      store.agents[existingIndex] = profile;
    } else {
      store.agents.push(profile);
    }

    await writeStore(store);
    return NextResponse.json({ ok: true, profile });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'auth failed' },
      { status: 401 }
    );
  }
}
