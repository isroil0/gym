import { describe, expect, it, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import '@/test/next-mocks';
import { apiMock } from '@/test/api-mock';
import { makeUserWithRole, renderWithProviders } from '@/test/render';
import { MemberHome } from '../MemberHome';

const DASHBOARD = {
  date: '2026-10-02',
  timeZone: 'Asia/Tashkent',
  memberId: 'm-1',
  memberCode: 'M-000001',
  memberName: 'Aziz Tursunov',
  membershipStatus: 'ACTIVE',
  membershipPlanName: 'Monthly Unlimited',
  membershipEndDate: '2026-10-30',
  daysRemaining: 28,
  visitsRemaining: null,
  unlimitedVisits: true,
  canCheckInNow: true,
  assignedTrainer: { name: 'Dilnoza Karimova', specialization: 'Strength' },
  visitsThisMonth: 6,
  visitsAllTime: 48,
  lastVisitAt: '2026-10-01T09:00:00.000Z',
  currentlyInside: false,
  nextSession: null,
  workoutPlanId: 'wp-1',
  workoutPlanName: '12-week strength block',
  workoutPlanDays: 3,
  outstandingBalance: '0.00',
};

const member = makeUserWithRole('MEMBER');

describe('MemberHome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.get.mockResolvedValue(DASHBOARD);
  });

  it('leads with the QR card, which is why the page gets opened', async () => {
    await renderWithProviders(<MemberHome />, { user: member });

    const card = await screen.findByRole('link', { name: /Show QR card/i });
    expect(card).toHaveAttribute('href', '/me/card');
  });

  it('states the membership plainly', async () => {
    await renderWithProviders(<MemberHome />, { user: member });

    expect(await screen.findByText('Monthly Unlimited', { exact: false })).toBeInTheDocument();
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    expect(screen.getByText('28')).toBeInTheDocument();
  });

  it('says "unlimited" rather than showing a blank visit count', async () => {
    await renderWithProviders(<MemberHome />, { user: member });
    expect(await screen.findByText('Unlimited visits')).toBeInTheDocument();
    expect(screen.queryByText('Visits remaining')).not.toBeInTheDocument();
  });

  it('shows the remaining visits when the plan is limited', async () => {
    apiMock.get.mockResolvedValue({ ...DASHBOARD, unlimitedVisits: false, visitsRemaining: 4 });
    await renderWithProviders(<MemberHome />, { user: member });

    expect(await screen.findByText('Visits remaining')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('does not nag about money when nothing is owed', async () => {
    await renderWithProviders(<MemberHome />, { user: member });
    await screen.findByRole('link', { name: /Show QR card/i });
    expect(screen.queryByText('Amount due')).not.toBeInTheDocument();
  });

  it('surfaces a debt, and links to where it can be understood', async () => {
    apiMock.get.mockResolvedValue({ ...DASHBOARD, outstandingBalance: '129.99' });
    await renderWithProviders(<MemberHome />, { user: member });

    expect(await screen.findByText('Amount due')).toBeInTheDocument();
    expect(screen.getByText(/129\.99/)).toBeInTheDocument();
    const link = screen.getByText('Amount due').closest('a');
    expect(link).toHaveAttribute('href', '/me/payments');
  });

  it('explains the absence of a membership instead of showing blanks', async () => {
    apiMock.get.mockResolvedValue({
      ...DASHBOARD,
      membershipStatus: null,
      membershipPlanName: null,
      membershipEndDate: null,
      daysRemaining: null,
    });
    await renderWithProviders(<MemberHome />, { user: member });

    expect(await screen.findByText('No membership')).toBeInTheDocument();
    expect(screen.getByText('Speak to the front desk to get started.')).toBeInTheDocument();
  });

  it('says when there is no trainer and no plan rather than printing a dash alone', async () => {
    apiMock.get.mockResolvedValue({
      ...DASHBOARD,
      assignedTrainer: null,
      workoutPlanName: null,
      workoutPlanId: null,
    });
    await renderWithProviders(<MemberHome />, { user: member });

    expect(await screen.findByText('No trainer assigned')).toBeInTheDocument();
    expect(screen.getByText('No workout plan yet')).toBeInTheDocument();
  });

  it('greets the member in Russian', async () => {
    await renderWithProviders(<MemberHome />, { user: member, locale: 'ru' });
    expect(await screen.findByRole('link', { name: /Показать QR-карту/ })).toBeInTheDocument();
    expect(screen.getByText('Абонемент')).toBeInTheDocument();
  });

  it('greets the member in Uzbek', async () => {
    await renderWithProviders(<MemberHome />, { user: member, locale: 'uz' });
    expect(await screen.findByRole('link', { name: /QR kartani ko'rsatish/ })).toBeInTheDocument();
  });

  it('offers a retry rather than a blank screen when the API fails', async () => {
    apiMock.get.mockRejectedValue(new Error('boom'));
    await renderWithProviders(<MemberHome />, { user: member });
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
