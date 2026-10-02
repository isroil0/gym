import { describe, expect, it, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/test/next-mocks';
import { apiMock } from '@/test/api-mock';
import { renderWithProviders } from '@/test/render';
import { DiscountDialog, ExtendDialog, UnfreezeDialog } from '../MembershipActions';
import type { Membership } from '@/lib/api/types';

const MEMBERSHIP = {
  id: 'ms-1',
  member: { id: 'm-1', memberCode: 'M-000001', firstName: 'Aziz', lastName: 'Tursunov', email: 'a@b.c' },
  plan: { id: 'p-1', name: 'Monthly Unlimited', durationDays: 30, currentPrice: '49.99' },
  status: 'ACTIVE',
  purchasePrice: '49.99',
  discountAmount: '0.00',
  amountDue: '49.99',
  startDate: '2026-10-01T00:00:00.000Z',
  endDate: '2026-10-30T00:00:00.000Z',
  totalDays: 30,
  daysRemaining: 28,
  visitsUsed: 0,
  unlimitedVisits: true,
  totalFrozenDays: 0,
  extendedDays: 0,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
} as unknown as Membership;

describe('membership actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.post.mockResolvedValue(MEMBERSHIP);
    apiMock.get.mockResolvedValue({ data: [], meta: {} });
  });

  describe('discount', () => {
    it('shows what the member will owe before committing', async () => {
      const user = userEvent.setup();
      await renderWithProviders(<DiscountDialog open membership={MEMBERSHIP} onClose={() => {}} />);

      await user.type(screen.getByLabelText('Discount amount'), '10');

      // 49.99 − 10.00 = 39.99, shown before the button is pressed.
      expect(await screen.findByText(/39\.99/)).toBeInTheDocument();
    });

    it('refuses a discount larger than the price', async () => {
      const user = userEvent.setup();
      await renderWithProviders(<DiscountDialog open membership={MEMBERSHIP} onClose={() => {}} />);

      await user.type(screen.getByLabelText('Discount amount'), '99');

      expect(await screen.findByText(/Must be at most/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Apply discount' })).toBeDisabled();
    });

    it('sends the amount as a number the backend accepts', async () => {
      const user = userEvent.setup();
      await renderWithProviders(<DiscountDialog open membership={MEMBERSHIP} onClose={() => {}} />);

      await user.type(screen.getByLabelText('Discount amount'), '10.50');
      await user.type(screen.getByLabelText('Reason'), 'Student');
      await user.click(screen.getByRole('button', { name: 'Apply discount' }));

      await waitFor(() =>
        expect(apiMock.post).toHaveBeenCalledWith('memberships/ms-1/discount', {
          amount: 10.5,
          reason: 'Student',
        }),
      );
    });
  });

  describe('extend', () => {
    it('shows the new end date before committing', async () => {
      const user = userEvent.setup();
      await renderWithProviders(<ExtendDialog open membership={MEMBERSHIP} onClose={() => {}} />);

      const days = screen.getByLabelText('Days to add');
      await user.clear(days);
      await user.type(days, '7');

      // 30 October + 7 days = 6 November.
      expect(await screen.findByText(/6 November 2026/)).toBeInTheDocument();
    });

    it('rejects a nonsensical number of days', async () => {
      const user = userEvent.setup();
      await renderWithProviders(<ExtendDialog open membership={MEMBERSHIP} onClose={() => {}} />);

      const days = screen.getByLabelText('Days to add');
      await user.clear(days);
      await user.type(days, '9999');

      expect(screen.getByRole('button', { name: 'Extend' })).toBeDisabled();
    });
  });

  describe('unfreeze', () => {
    it('says how many days are being credited back', async () => {
      const frozen = {
        ...MEMBERSHIP,
        status: 'FROZEN',
        totalFrozenDays: 5,
        frozenAt: null,
      } as unknown as Membership;

      await renderWithProviders(<UnfreezeDialog open membership={frozen} onClose={() => {}} />);
      expect(await screen.findByText(/5 days will be credited/)).toBeInTheDocument();
    });

    it('counts the stretch still running, not just the banked days', async () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString();
      const frozen = {
        ...MEMBERSHIP,
        status: 'FROZEN',
        totalFrozenDays: 2,
        frozenAt: threeDaysAgo,
      } as unknown as Membership;

      await renderWithProviders(<UnfreezeDialog open membership={frozen} onClose={() => {}} />);
      // 2 already banked plus 3 running = 5.
      expect(await screen.findByText(/5 days will be credited/)).toBeInTheDocument();
    });
  });

  it('shows a refusal from the backend in the reader’s language', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('@/lib/api/errors');
    apiMock.post.mockRejectedValue(
      new ApiError(422, { error: 'UNPROCESSABLE_ENTITY', message: 'English from the server' }),
    );

    await renderWithProviders(<ExtendDialog open membership={MEMBERSHIP} onClose={() => {}} />, {
      locale: 'ru',
    });

    await user.click(screen.getByRole('button', { name: 'Добавить дни' }));

    // The translated message for the real backend code, not the English prose.
    expect(await screen.findByText('Сейчас это действие недоступно.')).toBeInTheDocument();
  });
});
