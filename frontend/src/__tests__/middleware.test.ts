import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';

const SITE = 'https://gym.test';

function request(path: string, cookie?: string) {
  const req = new NextRequest(new URL(path, SITE));
  if (cookie) req.cookies.set('gym_rt', cookie);
  return req;
}

describe('middleware', () => {
  it('sends a visitor with no session to sign in', () => {
    const response = middleware(request('/admin/members'));

    expect(response.headers.get('location')).toBe(`${SITE}/login?next=%2Fadmin%2Fmembers`);
  });

  it('remembers where they were headed', () => {
    const response = middleware(request('/admin/members?page=2'));

    expect(response.headers.get('location')).toContain('next=%2Fadmin%2Fmembers%3Fpage%3D2');
  });

  it('does not add a next for the root', () => {
    const response = middleware(request('/'));

    expect(response.headers.get('location')).toBe(`${SITE}/login`);
  });

  it('lets a visitor with no session reach the sign-in page', () => {
    const response = middleware(request('/login'));

    expect(response.headers.get('location')).toBeNull();
  });

  it('sends somebody already signed in away from the sign-in page', () => {
    const response = middleware(request('/login', 'a-refresh-token'));

    expect(response.headers.get('location')).toBe(`${SITE}/`);
  });

  it('lets a session through to a protected page', () => {
    const response = middleware(request('/admin/members', 'a-refresh-token'));

    expect(response.headers.get('location')).toBeNull();
  });

  it('passes the path on, so a restored session can resume it', () => {
    // Without this the guards cannot tell the restore route where to return
    // the reader to, because a Server Component cannot read the request path.
    const response = middleware(request('/admin/members?page=2', 'a-refresh-token'));

    expect(response.headers.get('x-middleware-request-x-pathname')).toBe('/admin/members?page=2');
  });

  it('treats the password pages as public', () => {
    expect(middleware(request('/forgot-password')).headers.get('location')).toBeNull();
    expect(middleware(request('/reset-password')).headers.get('location')).toBeNull();
  });
});
