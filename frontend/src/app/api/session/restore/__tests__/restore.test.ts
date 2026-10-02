import { describe, expect, it, beforeEach, vi } from 'vitest';

const session = vi.hoisted(() => ({
  readTokens: vi.fn(),
  writeTokens: vi.fn(),
  clearTokens: vi.fn(),
  markRestored: vi.fn(),
  wasJustRestored: vi.fn(),
}));
const refresh = vi.hoisted(() => ({ refreshTokens: vi.fn() }));

vi.mock('@/lib/server/session', () => session);
vi.mock('@/lib/server/refresh', () => refresh);

const { GET } = await import('../route');

const TOKENS = { accessToken: 'new-access', refreshToken: 'new-refresh' };
const get = (url: string) => GET(new Request(url));

describe('session restore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.wasJustRestored.mockResolvedValue(false);
    session.readTokens.mockResolvedValue({ refreshToken: 'old-refresh' });
    refresh.refreshTokens.mockResolvedValue({ ok: true, tokens: TOKENS });
  });

  it('spends the refresh token and returns the reader to their page', async () => {
    const response = await get('https://gym.test/api/session/restore?next=%2Fadmin%2Fmembers');

    expect(refresh.refreshTokens).toHaveBeenCalledWith('old-refresh');
    expect(session.writeTokens).toHaveBeenCalledWith(TOKENS);
    expect(response.headers.get('location')).toBe('https://gym.test/admin/members');
  });

  it('falls back to the root when no page was remembered', async () => {
    const response = await get('https://gym.test/api/session/restore');

    expect(response.headers.get('location')).toBe('https://gym.test/');
  });

  it('clears the cookies when the refresh token is rejected', async () => {
    // This is the case that used to loop: the cookie middleware trusts has to
    // go, or the sign-in page is unreachable.
    refresh.refreshTokens.mockResolvedValue({ ok: false, status: 401 });

    const response = await get('https://gym.test/api/session/restore');

    expect(session.clearTokens).toHaveBeenCalled();
    expect(session.writeTokens).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBe('https://gym.test/login');
  });

  it('clears the cookies when there is no refresh token at all', async () => {
    session.readTokens.mockResolvedValue({});

    const response = await get('https://gym.test/api/session/restore');

    expect(session.clearTokens).toHaveBeenCalled();
    expect(refresh.refreshTokens).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBe('https://gym.test/login');
  });

  it('signs out rather than restoring twice in a row', async () => {
    // A restore that comes straight back is a loop, not a coincidence.
    session.wasJustRestored.mockResolvedValue(true);

    const response = await get('https://gym.test/api/session/restore?next=%2Fadmin');

    expect(refresh.refreshTokens).not.toHaveBeenCalled();
    expect(session.clearTokens).toHaveBeenCalled();
    expect(response.headers.get('location')).toBe('https://gym.test/login');
  });

  it('marks the restore so the next one is recognised as a loop', async () => {
    await get('https://gym.test/api/session/restore');

    expect(session.markRestored).toHaveBeenCalled();
  });

  it.each([
    ['an absolute url', 'https%3A%2F%2Fevil.test%2Fsteal'],
    ['a protocol-relative host', '%2F%2Fevil.test'],
    ['a backslash host', '%2F%5Cevil.test'],
    ['a bare path with no slash', 'admin'],
  ])('refuses to redirect to %s', async (_label, next) => {
    const response = await get(`https://gym.test/api/session/restore?next=${next}`);

    expect(response.headers.get('location')).toBe('https://gym.test/');
  });
});
