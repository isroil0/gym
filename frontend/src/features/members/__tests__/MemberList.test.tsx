import { describe, expect, it, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/test/next-mocks';
import { routerMock, setPathname, setSearch } from '@/test/next-mocks';
import { apiMock } from '@/test/api-mock';
import { renderWithProviders } from '@/test/render';
import { MemberList } from '../MemberList';

function member(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `m-${index}`,
    memberCode: `M-${String(index).padStart(6, '0')}`,
    status: 'ACTIVE',
    joinedAt: '2026-06-01T00:00:00.000Z',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    account: {
      id: `u-${index}`,
      email: `member${index}@gym.local`,
      firstName: 'Aziz',
      lastName: `Tursunov${index}`,
      phone: '+998901234567',
      status: 'ACTIVE',
    },
    assignedTrainer: null,
    ...overrides,
  };
}

function page(rows: unknown[], total = rows.length) {
  return {
    data: rows,
    meta: { page: 1, limit: 20, total, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
  };
}

describe('MemberList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setPathname('/admin/members');
    setSearch('');
    apiMock.get.mockImplementation((path: string) => {
      if (path === 'members') return Promise.resolve(page([member(1), member(2)], 30));
      if (path === 'trainers') return Promise.resolve(page([]));
      return Promise.reject(new Error(`Unstubbed ${path}`));
    });
  });

  it('lists the members the backend returned', async () => {
    await renderWithProviders(<MemberList />);
    expect(await screen.findByText('M-000001')).toBeInTheDocument();
    expect(screen.getByText('M-000002')).toBeInTheDocument();
  });

  it('asks the backend for exactly the filters in the URL', async () => {
    setSearch('status=ARCHIVED&page=2&search=aziz');
    await renderWithProviders(<MemberList />);

    await waitFor(() =>
      expect(apiMock.get).toHaveBeenCalledWith('members', {
        query: expect.objectContaining({ status: 'ARCHIVED', page: 2, search: 'aziz' }),
      }),
    );
  });

  it('omits blank filters rather than sending empty strings', async () => {
    await renderWithProviders(<MemberList />);

    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    const call = apiMock.get.mock.calls.find(([path]) => path === 'members');
    expect(call?.[1].query).toMatchObject({ page: 1, limit: 20 });
    expect(call?.[1].query.search).toBeUndefined();
    expect(call?.[1].query.status).toBeUndefined();
  });

  it('puts a search into the URL so the view can be shared and bookmarked', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<MemberList />);

    await user.type(screen.getByRole('searchbox'), 'malika');

    await waitFor(
      () => expect(routerMock.replace).toHaveBeenCalledWith(
        expect.stringContaining('search=malika'),
        expect.anything(),
      ),
      { timeout: 2000 },
    );
  });

  it('returns to page one when the filters change', async () => {
    const user = userEvent.setup();
    setSearch('page=3');
    await renderWithProviders(<MemberList />);

    await user.type(screen.getByRole('searchbox'), 'x');

    await waitFor(
      () => {
        const last = routerMock.replace.mock.calls.at(-1)?.[0] as string;
        expect(last).not.toContain('page=3');
      },
      { timeout: 2000 },
    );
  });

  it('distinguishes "no members yet" from "nothing matched"', async () => {
    apiMock.get.mockImplementation((path: string) =>
      path === 'members' ? Promise.resolve(page([], 0)) : Promise.resolve(page([])),
    );
    const { unmount } = await renderWithProviders(<MemberList />);
    expect(await screen.findByText('No members yet')).toBeInTheDocument();
    unmount();

    setSearch('search=zzz');
    await renderWithProviders(<MemberList />);
    expect(await screen.findByText('No members match these filters')).toBeInTheDocument();
  });

  it('does not offer sorting the backend cannot do', async () => {
    await renderWithProviders(<MemberList />);
    await screen.findByText('M-000001');
    // No list endpoint accepts a sort parameter; a sort control that silently
    // did nothing would be worse than none.
    expect(screen.queryByRole('button', { name: /sort/i })).not.toBeInTheDocument();
  });

  it('shows a dash rather than blank when a member has no trainer', async () => {
    await renderWithProviders(<MemberList />);
    await screen.findByText('M-000001');
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('renders the directory in Russian', async () => {
    await renderWithProviders(<MemberList />, { locale: 'ru' });
    expect(await screen.findByRole('heading', { name: 'Клиенты' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Добавить клиента' })).toBeInTheDocument();
  });

  it('renders the directory in Uzbek', async () => {
    await renderWithProviders(<MemberList />, { locale: 'uz' });
    expect(await screen.findByRole('heading', { name: "A'zolar" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "A'zo qo'shish" })).toBeInTheDocument();
  });

  it('offers a retry when the list fails to load', async () => {
    apiMock.get.mockRejectedValue(new Error('boom'));
    await renderWithProviders(<MemberList />);
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
