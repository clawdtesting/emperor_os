import { NextResponse } from 'next/server';
import { loginWithAgentKey } from '@/lib/server/auth';

export async function POST(request: Request) {
  const body = (await request.json()) as {
    agentId?: string;
    label?: string;
    signingPublicKey?: string;
    encryptionPublicKey?: string;
    signature?: string;
  };

  if (!body.agentId || !body.label || !body.signingPublicKey || !body.encryptionPublicKey || !body.signature) {
    return NextResponse.json(
      { error: 'agentId, label, signingPublicKey, encryptionPublicKey, and signature are required' },
      { status: 400 }
    );
  }

  try {
    const result = await loginWithAgentKey({
      agentId: body.agentId,
      label: body.label,
      signingPublicKey: body.signingPublicKey,
      encryptionPublicKey: body.encryptionPublicKey,
      signature: body.signature
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'login failed' },
      { status: 401 }
    );
  }
}
