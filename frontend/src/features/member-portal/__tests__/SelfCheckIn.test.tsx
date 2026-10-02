import { describe, expect, it, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/test/next-mocks';
import { apiMock } from '@/test/api-mock';
import { makeUserWithRole, renderWithProviders } from '@/test/render';
import { SelfCheckIn } from '../SelfCheckIn';
import { ApiError } from '@/lib/api/errors';

// The scanner owns a camera; stand in for it with a button that reports a code.
const scanned = vi.hoisted(() => ({ emit: (_code: string) => {} }));
vi.mock('@/features/attendance/QrScanner', () => ({
  QrScanner: ({ onScan, busy }: { onScan: (c: string) => void; busy?: boolean }) => {
    scanned.emit = onScan;
    return <button type="button" disabled={busy} onClick={() => onScan('DOOR1.123.abc')}>fake-scan</button>;
  },
}));

const member = makeUserWithRole('MEMBER');

function admitted(overrides = {}) {
  return {
    admitted: true,
    attendance: {
      id: 'a-1', memberId: 'm-1', memberCode: 'M-000001', memberName: 'Aziz Tursunov',
      checkedInAt: '2026-10-02T09:15:00.000Z', stillInside: true, method: 'QR', visitDeducted: false,
    },
    visitsRemaining: null,
    membershipDaysRemaining: 30,
    ...overrides,
  };
}

function denial(reason: string) {
  return new ApiError(422, {
    error: 'UNPROCESSABLE_ENTITY', message: 'Entry refused',
    details: [{ field: 'reason', messages: [reason] }],
  });
}

describe('SelfCheckIn', () => {
  beforeEach(() => vi.clearAllMocks());

  it('asks the member to scan the code at the door', async () => {
    await renderWithProviders(<SelfCheckIn />, { user: member });
    expect(screen.getByText('Point your camera at the code at the door')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Scan to check in/ })).toBeInTheDocument();
  });

  it('sends only the code — never a member id', async () => {
    // The member is identified by their session. If the body carried an id,
    // a member could admit somebody else.
    const user = userEvent.setup();
    apiMock.post.mockResolvedValue(admitted());
    await renderWithProviders(<SelfCheckIn />, { user: member });

    await user.click(screen.getByRole('button', { name: /Scan to check in/ }));
    await user.click(await screen.findByText('fake-scan'));

    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith('attendance/check-in/self', { code: 'DOOR1.123.abc' }),
    );
  });

  it('confirms admission with the member’s own name', async () => {
    const user = userEvent.setup();
    apiMock.post.mockResolvedValue(admitted());
    await renderWithProviders(<SelfCheckIn />, { user: member });

    await user.click(screen.getByRole('button', { name: /Scan to check in/ }));
    await user.click(await screen.findByText('fake-scan'));

    const panel = await screen.findByRole('status');
    expect(panel).toHaveTextContent('Admitted');
    expect(panel).toHaveTextContent('Aziz Tursunov');
  });

  it('explains a retired code as something to fix, not a failure', async () => {
    const user = userEvent.setup();
    apiMock.post.mockRejectedValue(denial('DOOR_CODE_RETIRED'));
    await renderWithProviders(<SelfCheckIn />, { user: member });

    await user.click(screen.getByRole('button', { name: /Scan to check in/ }));
    await user.click(await screen.findByText('fake-scan'));

    expect(
      await screen.findByText('This entry code is no longer in use. Scan the current code at the door'),
    ).toBeInTheDocument();
  });

  it('says plainly when the wrong QR was scanned', async () => {
    const user = userEvent.setup();
    apiMock.post.mockRejectedValue(denial('DOOR_CODE_INVALID'));
    await renderWithProviders(<SelfCheckIn />, { user: member });

    await user.click(screen.getByRole('button', { name: /Scan to check in/ }));
    await user.click(await screen.findByText('fake-scan'));

    expect(await screen.findByText('This is not the gym entry code')).toBeInTheDocument();
  });

  it('passes a membership refusal through unchanged', async () => {
    // The member hears exactly what the front desk would have been told.
    const user = userEvent.setup();
    apiMock.post.mockRejectedValue(denial('MEMBERSHIP_FROZEN'));
    await renderWithProviders(<SelfCheckIn />, { user: member });

    await user.click(screen.getByRole('button', { name: /Scan to check in/ }));
    await user.click(await screen.findByText('fake-scan'));

    expect(await screen.findByText('This membership is frozen')).toBeInTheDocument();
  });

  it('refreshes what the member sees after being admitted', async () => {
    const user = userEvent.setup();
    apiMock.post.mockResolvedValue(admitted({ membershipDaysRemaining: 3 }));
    const { queryClient } = await renderWithProviders(<SelfCheckIn />, { user: member });
    const spy = vi.spyOn(queryClient, 'invalidateQueries');

    await user.click(screen.getByRole('button', { name: /Scan to check in/ }));
    await user.click(await screen.findByText('fake-scan'));

    await waitFor(() => expect(spy).toHaveBeenCalled());
    // Days remaining just changed; the home screen must not keep the old one.
    expect(spy.mock.calls.flatMap((c) => c[0]?.queryKey ?? [])).toContain('dashboard');
  });

  it('warns about an expiring membership while admitting them', async () => {
    const user = userEvent.setup();
    apiMock.post.mockResolvedValue(admitted({ membershipDaysRemaining: 3 }));
    await renderWithProviders(<SelfCheckIn />, { user: member });

    await user.click(screen.getByRole('button', { name: /Scan to check in/ }));
    await user.click(await screen.findByText('fake-scan'));

    expect(await screen.findByText('This membership expires in 3 days')).toBeInTheDocument();
  });

  it('renders in Russian', async () => {
    await renderWithProviders(<SelfCheckIn />, { user: member, locale: 'ru' });
    expect(screen.getByRole('button', { name: /Сканировать и войти/ })).toBeInTheDocument();
  });

  it('renders in Uzbek', async () => {
    await renderWithProviders(<SelfCheckIn />, { user: member, locale: 'uz' });
    expect(screen.getByRole('button', { name: /Skanerlab kirish/ })).toBeInTheDocument();
  });
});
