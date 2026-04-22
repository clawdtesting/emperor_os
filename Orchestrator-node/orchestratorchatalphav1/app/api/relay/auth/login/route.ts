import { NextResponse } from 'next/server';
import { loginWithAgentKey } from '@/lib/relay/service';
import type { AgentCapabilities } from '@/lib/types/domain';

export async function POST(request: Request) {
  const body = (await request.json()) as {
    agentId?: string;
    label?: string;
    signingPublicKey?: string;
    encryptionPublicKey?: string;
    signature?: string;
    capabilities?: AgentCapabilities;
  };

  if (!body.agentId || !body.label || !body.signingPublicKey || !body.encryptionPublicKey || !body.signature) {
    return NextResponse.json(
      { error: 'agentId, label, signingPublicKey, encryptionPublicKey, signature required', code: 'INVALID' },
      { status: 400 }
    );
  }

  try {
    const result = await loginWithAgentKey({
      agentId: body.agentId,
      label: body.label,
      signingPublicKey: body.signingPublicKey,
      encryptionPublicKey: body.encryptionPublicKey,
      signature: body.signature,
      capabilities: body.capabilities
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'login failed', code: 'AUTH' },
      { status: 401 }
    );
  }
}
