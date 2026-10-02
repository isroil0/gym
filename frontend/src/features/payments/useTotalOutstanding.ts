'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Paginated } from '@/lib/api/types';
import type { MemberBilling } from './usePayments';

const PAGE_SIZE = 100;
/** Enough for 2,000 debtors. Beyond that the figure is reported as partial. */
const MAX_PAGES = 20;

export interface TotalOutstanding {
  /** Exact sum across every debtor, to the penny. */
  total: string;
  membersInDebt: number;
  /** True when the debtor list was longer than this client would walk. */
  truncated: boolean;
}

/**
 * The exact total owed to the gym.
 *
 * This has to be summed client-side because neither endpoint that reports it
 * is reliable:
 *
 *  - `GET /dashboard/admin` sums only the five debtors it fetched for its
 *    "top debtors" panel, while reporting `membersInDebt` for all of them.
 *    With more than five debtors the headline figure is simply too low.
 *  - `GET /reports/unpaid-balances` has the same shape of bug but a limit of
 *    100, so it is correct only while the gym has at most 100 debtors.
 *
 * Both are recorded as backend defects. Until they are fixed, paging through
 * `GET /billing/outstanding` — whose per-member figures are correct — and
 * adding them up here is the only way to show a number that is right.
 *
 * Summing is done in integer minor units so repeated addition cannot drift.
 */
export function useTotalOutstanding() {
  return useQuery({
    queryKey: ['billing', 'outstanding', 'total'],
    queryFn: async (): Promise<TotalOutstanding> => {
      let page = 1;
      let minor = 0;
      let membersInDebt = 0;
      let truncated = false;

      for (;;) {
        const result = await api.get<Paginated<MemberBilling>>('billing/outstanding', {
          query: { page, limit: PAGE_SIZE },
        });
        membersInDebt = result.meta.total;
        for (const row of result.data) {
          minor += Math.round(Number(row.outstanding) * 100);
        }
        if (!result.meta.hasNextPage) break;
        page += 1;
        if (page > MAX_PAGES) {
          truncated = true;
          break;
        }
      }

      return { total: (minor / 100).toFixed(2), membersInDebt, truncated };
    },
    staleTime: 60_000,
  });
}
