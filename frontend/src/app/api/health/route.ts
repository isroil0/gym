import { NextResponse } from 'next/server';
import { callBackend } from '@/lib/server/backend';

/**
 * Is the API reachable?
 *
 * The backend's health endpoint sits at `/api/health`, outside the versioned
 * prefix the proxy rewrites, so it needs its own route. Returns only up/down —
 * the backend's health payload describes infrastructure and is not something
 * to hand to a browser.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const result = await callBackend('/api/health');
    return NextResponse.json({ ok: result.status === 200 }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
