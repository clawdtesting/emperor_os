import { NextResponse } from 'next/server';
import { loginWithSignature } from '@/lib/server/auth';

export async function POST(request: Request) {
  const body = (await request.json()) as { wallet?: `0x${string}`; signature?: string };

  if (!body.wallet || !body.signature) {
    return NextResponse.json({ error: 'wallet and signature required' }, { status: 400 });
  }

  try {
    const result = await loginWithSignature({ wallet: body.wallet, signature: body.signature });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'login failed' },
      { status: 401 }
    );
  }
}
