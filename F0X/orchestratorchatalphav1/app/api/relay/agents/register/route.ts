import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/server/auth';
import { registerOrUpdateAgent } from '@/lib/relay/service';
import type { AgentProfile } from '@/lib/types/domain';

export async function POST(request: Request) {
  try {
    const { agentId } = await requireSession();
    const profile = (await request.json()) as AgentProfile;

    if (!profile.agentId || !profile.label || !profile.signingPublicKey || !profile.encryptionPublicKey) {
      return NextResponse.json({ error: 'invalid profile payload', code: 'INVALID' }, { status: 400 });
    }

    const saved = await registerOrUpdateAgent(agentId, profile);
    return NextResponse.json({ ok: true, profile: saved });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'failed';
    const status = msg.includes('must match') ? 403 : 401;
    return NextResponse.json({ error: msg, code: 'AUTH' }, { status });
  }
}
