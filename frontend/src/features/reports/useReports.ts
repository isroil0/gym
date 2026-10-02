'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { keys } from '@/lib/api/keys';

export interface ReportRange {
  from: string;
  to: string;
  groupBy?: 'day' | 'month';
}

/** One report, fetched only while its tab is the one being looked at. */
export function useReport<T>(name: string, range: ReportRange, enabled = true) {
  const query: Record<string, string> = { from: range.from, to: range.to };
  if (range.groupBy) query.groupBy = range.groupBy;

  return useQuery({
    queryKey: keys.reports.one(name, query),
    queryFn: () => api.get<T>(`reports/${name}`, { query }),
    enabled: enabled && Boolean(range.from && range.to),
    placeholderData: (previous) => previous,
  });
}

/** Reports with no period: the current state of unpaid balances. */
export function useUnpaidReport<T>(enabled = true) {
  return useQuery({
    queryKey: keys.reports.one('unpaid-balances', { limit: 100 }),
    queryFn: () => api.get<T>('reports/unpaid-balances', { query: { limit: 100 } }),
    enabled,
  });
}
