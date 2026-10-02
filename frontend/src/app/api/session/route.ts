import { NextResponse } from 'next/server';
import { apiPath, callBackend } from '@/lib/server/backend';
import { clearTokens, readTokens, writeTokens } from '@/lib/server/session';
import type { ApiErrorBody } from '@/lib/api/errors';

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: unknown;
}

function isLoginResponse(value: unknown): value is LoginResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as LoginResponse).accessToken === 'string' &&
    typeof (value as LoginResponse).refreshToken === 'string'
  );
}

/**
 * Sign in. The backend's tokens are moved straight into httpOnly cookies and
 * deliberately left out of the response body — the browser receives the user
 * record and nothing it could leak.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'Invalid body' }, { status: 400 });
  }

  const result = await callBackend(apiPath('auth/login'), {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (result.status !== 200 || !isLoginResponse(result.body)) {
    return NextResponse.json((result.body as ApiErrorBody) ?? { message: 'Login failed' }, {
      status: result.status || 502,
    });
  }

  await writeTokens({
    accessToken: result.body.accessToken,
    refreshToken: result.body.refreshToken,
  });

  return NextResponse.json({ user: result.body.user });
}

/** Sign out: revoke the refresh token at the backend, then drop the cookies. */
export async function DELETE(): Promise<NextResponse> {
  const { accessToken, refreshToken } = await readTokens();

  if (refreshToken) {
    // A failure here must not block sign-out; the cookies go either way.
    await callBackend(apiPath('auth/logout'), {
      method: 'POST',
      accessToken,
      body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined);
  }

  await clearTokens();
  return NextResponse.json({ ok: true });
}
