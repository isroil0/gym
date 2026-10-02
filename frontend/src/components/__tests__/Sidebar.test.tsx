import { describe, expect, it, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import '@/test/next-mocks';
import { setPathname } from '@/test/next-mocks';
import { renderWithProviders } from '@/test/render';
import { Sidebar } from '@/components/layout/Sidebar';

describe('Sidebar', () => {
  beforeEach(() => setPathname('/admin'));

  it('shows an administrator the finance sections', async () => {
    await renderWithProviders(<Sidebar role="ADMIN" collapsed={false} />);

    expect(screen.getByRole('link', { name: 'Accounting' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reports' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Trainers' })).toBeInTheDocument();
  });

  it('never offers a trainer the accounting or trainer-management pages', async () => {
    setPathname('/trainer');
    await renderWithProviders(<Sidebar role="TRAINER" collapsed={false} />);

    expect(screen.queryByRole('link', { name: 'Accounting' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Trainers' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My members' })).toBeInTheDocument();
  });

  it('gives a member only their own records', async () => {
    setPathname('/me');
    await renderWithProviders(<Sidebar role="MEMBER" collapsed={false} />);

    expect(screen.queryByRole('link', { name: 'Members' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Accounting' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My membership' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'QR card' })).toBeInTheDocument();
  });

  it('marks the current page for assistive technology, not just visually', async () => {
    setPathname('/admin/members');
    await renderWithProviders(<Sidebar role="ADMIN" collapsed={false} />);

    expect(screen.getByRole('link', { name: 'Members' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
  });

  it('keeps the parent highlighted on a detail page', async () => {
    setPathname('/admin/members/abc-123');
    await renderWithProviders(<Sidebar role="ADMIN" collapsed={false} />);

    expect(screen.getByRole('link', { name: 'Members' })).toHaveAttribute('aria-current', 'page');
  });

  it('does not light up the area root for every page beneath it', async () => {
    setPathname('/admin/payments');
    await renderWithProviders(<Sidebar role="ADMIN" collapsed={false} />);

    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Payments' })).toHaveAttribute('aria-current', 'page');
  });

  it('renders in every language without leaking a translation key', async () => {
    for (const locale of ['uz', 'ru'] as const) {
      const { unmount } = await renderWithProviders(<Sidebar role="ADMIN" collapsed={false} />, {
        locale,
      });
      const nav = screen.getByRole('navigation');
      expect(nav.textContent).not.toMatch(/navigation\.[a-z]/i);
      unmount();
    }
  });

  it('translates the navigation into Russian', async () => {
    await renderWithProviders(<Sidebar role="ADMIN" collapsed={false} />, { locale: 'ru' });
    expect(screen.getByRole('link', { name: 'Клиенты' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Бухгалтерия' })).toBeInTheDocument();
  });

  it('translates the navigation into Uzbek', async () => {
    await renderWithProviders(<Sidebar role="ADMIN" collapsed={false} />, { locale: 'uz' });
    expect(screen.getByRole('link', { name: "A'zolar" })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Buxgalteriya' })).toBeInTheDocument();
  });
});
