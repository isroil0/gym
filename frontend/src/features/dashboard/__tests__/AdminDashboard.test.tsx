import { describe, expect, it, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import '@/test/next-mocks';
import { apiMock, respondWith } from '@/test/api-mock';
import { renderWithProviders } from '@/test/render';
import { AdminDashboard } from '../AdminDashboard';

const DASHBOARD = {
  date: '2026-10-02',
  timeZone: 'Asia/Tashkent',
  month: '2026-10',
  activeMembers: 16,
  expiredMembers: 11,
  totalMembers: 30,
  membersWithoutMembership: 3,
  expiringSoonCount: 8,
  expiringSoon: [
    {
      membershipId: 'ms-1',
      memberId: 'm-1',
      memberCode: 'M-000001',
      memberName: 'Aziz Tursunov',
      planName: 'Monthly Unlimited',
      endDate: '2026-10-05',
      daysRemaining: 3,
    },
  ],
  todayCheckIns: 6,
  currentlyInside: 2,
  monthlyRevenue: '1798.35',
  monthlyExpenses: '13035.00',
  monthlyProfit: '-11236.65',
  totalOutstanding: '853.48',
  membersInDebt: 7,
  topDebtors: [
    { memberId: 'm-2', memberCode: 'M-000002', memberName: 'Malika Abdullaeva', outstanding: '129.99' },
  ],
  newMembersThisMonth: 30,
  membershipsSoldThisMonth: 27,
  activeTrainers: 3,
  sessionsToday: 6,
};

const EMPTY_SERIES = { period: { from: '2026-09-03', to: '2026-10-02', timeZone: 'Asia/Tashkent' }, series: [] };

function stub(overrides: Record<string, unknown> = {}) {
  respondWith({
    'dashboard/admin': DASHBOARD,
    'reports/profit': { ...EMPTY_SERIES, revenue: '0', expenses: '0', profit: '0', marginPercent: 0 },
    'reports/attendance': {
      ...EMPTY_SERIES,
      totalVisits: 0,
      uniqueMembers: 0,
      averageVisitsPerDay: 0,
      averageDurationMinutes: 0,
      byMethod: {},
      busiestHours: [],
    },
    payments: { data: [], meta: { page: 1, limit: 6, total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false } },
    attendance: { data: [], meta: { page: 1, limit: 6, total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false } },
    ...overrides,
  });
}

describe('AdminDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stub();
  });

  it('shows the figures the backend reported, and no others', async () => {
    await renderWithProviders(<AdminDashboard />);

    expect(await screen.findByText('16')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('11')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('formats money with the configured currency and two decimals', async () => {
    await renderWithProviders(<AdminDashboard />);
    // 1798.35, not 1798.3 and not 1798.350000001.
    expect(await screen.findByText(/1,798\.35/)).toBeInTheDocument();
    expect(screen.getByText(/13,035\.00/)).toBeInTheDocument();
  });

  it('shows a loss as a loss rather than as a negative-looking profit', async () => {
    await renderWithProviders(<AdminDashboard />);
    const value = await screen.findByText(/11,236\.65/);
    expect(value.textContent).toContain('-');
  });

  it('warns about memberships about to lapse, with a way to act on it', async () => {
    await renderWithProviders(<AdminDashboard />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('8 memberships expire within 7 days');
    expect(screen.getByRole('link', { name: 'Review them' })).toHaveAttribute(
      'href',
      '/admin/memberships?status=ACTIVE&expiring=1',
    );
  });

  it('says nothing is expiring when nothing is, instead of an empty alert', async () => {
    stub({ 'dashboard/admin': { ...DASHBOARD, expiringSoonCount: 0, expiringSoon: [] } });
    await renderWithProviders(<AdminDashboard />);

    expect(await screen.findByText('No memberships expiring in the next 7 days')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('lets a figure be clicked through to the records behind it', async () => {
    await renderWithProviders(<AdminDashboard />);

    expect(await screen.findByRole('link', { name: /Active members/ })).toHaveAttribute(
      'href',
      '/admin/members?membershipStatus=ACTIVE',
    );
    // The outstanding figure leads to the Debts tab, which lists the people
    // behind it.
    expect(screen.getByRole('link', { name: /Outstanding balances/ })).toHaveAttribute(
      'href',
      '/admin/accounting?view=debts',
    );
  });

  it('offers a retry instead of a blank page when the API fails', async () => {
    apiMock.get.mockRejectedValue(new Error('boom'));
    await renderWithProviders(<AdminDashboard />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('renders completely in Russian', async () => {
    await renderWithProviders(<AdminDashboard />, { locale: 'ru' });
    expect(await screen.findByText('Активные клиенты')).toBeInTheDocument();
    expect(screen.getByText('Выручка за месяц')).toBeInTheDocument();
    expect(screen.getByText('Задолженность')).toBeInTheDocument();
  });

  it('renders completely in Uzbek', async () => {
    await renderWithProviders(<AdminDashboard />, { locale: 'uz' });
    expect(await screen.findByText("Faol a'zolar")).toBeInTheDocument();
    expect(screen.getByText('Shu oydagi tushum')).toBeInTheDocument();
  });

  it('pluralises the expiry warning correctly in Russian', async () => {
    stub({ 'dashboard/admin': { ...DASHBOARD, expiringSoonCount: 1 } });
    await renderWithProviders(<AdminDashboard />, { locale: 'ru' });
    // "1 абонемент", not "1 абонементов".
    expect(await screen.findByRole('alert')).toHaveTextContent('1 абонемент истекает');
  });

  it('uses the many-form for counts Russian treats as many', async () => {
    stub({ 'dashboard/admin': { ...DASHBOARD, expiringSoonCount: 8 } });
    await renderWithProviders(<AdminDashboard />, { locale: 'ru' });
    expect(await screen.findByRole('alert')).toHaveTextContent('8 абонементов истекают');
  });
});
