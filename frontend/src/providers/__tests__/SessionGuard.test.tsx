import { describe, expect, it, beforeEach, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import '@/test/next-mocks';
import { routerMock } from '@/test/next-mocks';
import { apiMock } from '@/test/api-mock';
import { makeUserWithRole, renderWithProviders } from '@/test/render';
import { SessionGuard } from '../SessionGuard';
import { ApiError } from '@/lib/api/errors';
import { useQuery } from '@tanstack/react-query';

/** A component that fails the way a real page fails. */
function FailingPanel({ error }: { error: unknown }) {
  useQuery({
    queryKey: ['panel', Math.random()],
    queryFn: () => Promise.reject(error),
    retry: false,
  });
  return null;
}

describe('SessionGuard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends the reader to sign in when the session has gone', async () => {
    await renderWithProviders(
      <>
        <SessionGuard />
        <FailingPanel error={new ApiError(401, { error: 'UNAUTHORIZED', message: 'x' })} />
      </>,
      { user: makeUserWithRole('ADMIN') },
    );

    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/login'));
  });

  it('moves the reader to their own area when the identity changed underneath', async () => {
    // Signing in as somebody else in another tab replaces the cookie; this
    // page is still rendering an administrator's navigation.
    apiMock.get.mockResolvedValue(makeUserWithRole('MEMBER'));

    await renderWithProviders(
      <>
        <SessionGuard />
        <FailingPanel error={new ApiError(403, { error: 'FORBIDDEN', message: 'x' })} />
      </>,
      { user: makeUserWithRole('ADMIN') },
    );

    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/me'));
  });

  it('leaves an ordinary refusal alone when the role has not changed', async () => {
    // A 403 can simply mean this account may not do this one thing. The
    // screen should show its own error rather than being navigated away.
    apiMock.get.mockResolvedValue(makeUserWithRole('ADMIN'));

    await renderWithProviders(
      <>
        <SessionGuard />
        <FailingPanel error={new ApiError(403, { error: 'FORBIDDEN', message: 'x' })} />
      </>,
      { user: makeUserWithRole('ADMIN') },
    );

    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith('auth/me'));
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('ignores errors that say nothing about the session', async () => {
    await renderWithProviders(
      <>
        <SessionGuard />
        <FailingPanel error={new ApiError(500, { error: 'INTERNAL_SERVER_ERROR', message: 'x' })} />
      </>,
      { user: makeUserWithRole('ADMIN') },
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('corrects once, not once per failed request', async () => {
    // A dashboard fires half a dozen calls at once; they must not each
    // try to navigate.
    apiMock.get.mockResolvedValue(makeUserWithRole('TRAINER'));

    await renderWithProviders(
      <>
        <SessionGuard />
        {Array.from({ length: 6 }, (_, i) => (
          <FailingPanel key={i} error={new ApiError(403, { error: 'FORBIDDEN', message: 'x' })} />
        ))}
      </>,
      { user: makeUserWithRole('ADMIN') },
    );

    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/trainer'));
    expect(routerMock.replace).toHaveBeenCalledTimes(1);
  });
});
