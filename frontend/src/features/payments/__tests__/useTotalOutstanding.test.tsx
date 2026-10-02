import { describe, expect, it, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { apiMock } from '@/test/api-mock';
import { useTotalOutstanding } from '../useTotalOutstanding';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function page(rows: Array<{ outstanding: string }>, total: number, hasNext: boolean, pageNo = 1) {
  return {
    data: rows.map((row, index) => ({ ...row, memberId: `m-${pageNo}-${index}` })),
    meta: { page: pageNo, limit: 100, total, totalPages: 2, hasNextPage: hasNext, hasPreviousPage: false },
  };
}

describe('useTotalOutstanding', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sums every debtor, not just the first page', async () => {
    // The backend's own dashboard figure sums only five rows; this must not.
    apiMock.get.mockImplementation((_path: string, options: { query: { page: number } }) =>
      Promise.resolve(
        options.query.page === 1
          ? page([{ outstanding: '224.50' }, { outstanding: '224.50' }], 4, true, 1)
          : page([{ outstanding: '129.99' }, { outstanding: '10.00' }], 4, false, 2),
      ),
    );

    const { result } = renderHook(() => useTotalOutstanding(), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual({
      total: '588.99',
      membersInDebt: 4,
      truncated: false,
    });
    expect(apiMock.get).toHaveBeenCalledTimes(2);
  });

  it('adds in minor units so repeated addition cannot drift', async () => {
    // Ten lots of 0.07 is 0.7000000000000001 in binary floating point.
    const rows = Array.from({ length: 10 }, () => ({ outstanding: '0.07' }));
    apiMock.get.mockResolvedValue(page(rows, 10, false));

    const { result } = renderHook(() => useTotalOutstanding(), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.total).toBe('0.70');
  });

  it('stops after one request when there is only one page', async () => {
    apiMock.get.mockResolvedValue(page([{ outstanding: '49.99' }], 1, false));

    const { result } = renderHook(() => useTotalOutstanding(), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.total).toBe('49.99');
    expect(apiMock.get).toHaveBeenCalledTimes(1);
  });

  it('reports zero rather than nothing when nobody owes anything', async () => {
    apiMock.get.mockResolvedValue(page([], 0, false));

    const { result } = renderHook(() => useTotalOutstanding(), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual({ total: '0.00', membersInDebt: 0, truncated: false });
  });

  it('flags the figure as partial rather than walking forever', async () => {
    apiMock.get.mockResolvedValue(page([{ outstanding: '1.00' }], 10_000, true));

    const { result } = renderHook(() => useTotalOutstanding(), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.truncated).toBe(true);
  });
});
