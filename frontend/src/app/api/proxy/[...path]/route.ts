import { NextResponse } from 'next/server';
import { apiPath, callBackend } from '@/lib/server/backend';
import { refreshTokens } from '@/lib/server/refresh';
import { clearTokens, readTokens, writeTokens } from '@/lib/server/session';

/**
 * The single door between the browser and the API.
 *
 * Every call the client makes comes through here. The access token is added
 * server-side from an httpOnly cookie, so it is never present in any document
 * the browser can read. When the backend says the token has expired, the
 * refresh happens here too and the original request is retried once — the
 * page that made the call never learns that anything happened.
 *
 * The backend remains the authority on who may do what. This route forwards
 * credentials; it does not decide permissions.
 */

/** Headers that belong to the hop, not the message. */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
  'cookie',
  'authorization',
]);

function forwardableHeaders(request: Request): Record<string, string> {
  const out: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) out[key] = value;
  });
  // Let the backend's audit trail record the real caller rather than the
  // Next.js server, and reuse the browser's correlation id if it sent one.
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) out['x-forwarded-for'] = forwardedFor;
  return out;
}

async function handle(request: Request, segments: string[]): Promise<NextResponse> {
  const url = new URL(request.url);
  const path = apiPath(segments.join('/'));
  const search = url.search;

  const body =
    request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text();

  const { accessToken, refreshToken } = await readTokens();
  const headers = forwardableHeaders(request);

  let result;
  try {
    result = await callBackend(path, {
      method: request.method,
      body: body || undefined,
      accessToken,
      headers,
      search,
    });
  } catch {
    return NextResponse.json(
      { success: false, statusCode: 502, error: 'NETWORK_ERROR', message: 'Cannot reach the API' },
      { status: 502 },
    );
  }

  // Expired access token: spend the refresh token once and replay the call.
  if (result.status === 401 && refreshToken) {
    const refreshed = await refreshTokens(refreshToken);

    if (!refreshed.ok) {
      await clearTokens();
      return NextResponse.json(
        {
          success: false,
          statusCode: 401,
          error: 'UNAUTHORIZED',
          message: 'Your session has ended',
        },
        { status: 401 },
      );
    }

    await writeTokens(refreshed.tokens);

    try {
      result = await callBackend(path, {
        method: request.method,
        body: body || undefined,
        accessToken: refreshed.tokens.accessToken,
        headers,
        search,
      });
    } catch {
      return NextResponse.json(
        { success: false, statusCode: 502, error: 'NETWORK_ERROR', message: 'Cannot reach the API' },
        { status: 502 },
      );
    }
  }

  // A 401 that survived the refresh means the credential itself is finished.
  if (result.status === 401) await clearTokens();

  if (result.body === null && result.raw === '') {
    return new NextResponse(null, { status: result.status });
  }

  return NextResponse.json(result.body ?? { message: result.raw }, { status: result.status });
}

type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, ctx: Context) {
  return handle(request, (await ctx.params).path);
}
export async function POST(request: Request, ctx: Context) {
  return handle(request, (await ctx.params).path);
}
export async function PATCH(request: Request, ctx: Context) {
  return handle(request, (await ctx.params).path);
}
export async function PUT(request: Request, ctx: Context) {
  return handle(request, (await ctx.params).path);
}
export async function DELETE(request: Request, ctx: Context) {
  return handle(request, (await ctx.params).path);
}
