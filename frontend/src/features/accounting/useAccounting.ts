'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { keys } from '@/lib/api/keys';
import type { AccountingEntry, ExpenseCategory, Paginated, Schemas } from '@/lib/api/types';

export type PeriodSummary = Schemas['PeriodSummaryDto'];
export type PeriodBucket = Schemas['PeriodBucketDto'];

export interface EntryQuery extends Record<string, string> {
  page: string;
  limit: string;
  type: string;
  expenseCategoryId: string;
  trainerId: string;
  from: string;
  to: string;
  search: string;
}

export function useEntryList(query: Partial<EntryQuery>) {
  const params = {
    page: Number(query.page) || 1,
    limit: Number(query.limit) || 20,
    type: query.type || undefined,
    expenseCategoryId: query.expenseCategoryId || undefined,
    trainerId: query.trainerId || undefined,
    from: query.from || undefined,
    to: query.to || undefined,
    search: query.search || undefined,
  };
  return useQuery({
    queryKey: keys.accounting.entries(params),
    queryFn: () => api.get<Paginated<AccountingEntry>>('accounting/entries', { query: params }),
    placeholderData: (previous) => previous,
  });
}

export function useSummary(range: { from: string; to: string }) {
  return useQuery({
    queryKey: keys.accounting.summary(range),
    queryFn: () => api.get<PeriodSummary>('accounting/summary', { query: range }),
    enabled: Boolean(range.from && range.to),
  });
}

export function useDailyTotals(range: { from: string; to: string }) {
  return useQuery({
    queryKey: keys.accounting.daily(range),
    queryFn: () => api.get<PeriodBucket[]>('accounting/daily', { query: range }),
    enabled: Boolean(range.from && range.to),
  });
}

export function useExpenseCategories(includeArchived = false) {
  const params = { limit: 100, status: includeArchived ? undefined : 'ACTIVE' };
  return useQuery({
    queryKey: keys.accounting.categories(params),
    queryFn: () =>
      api.get<Paginated<ExpenseCategory>>('accounting/expense-categories', { query: params }),
    staleTime: 5 * 60_000,
  });
}

function useLedgerMutation<T, TBody>(run: (body: TBody) => Promise<T>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.accounting.all });
      void queryClient.invalidateQueries({ queryKey: keys.dashboards.admin });
      void queryClient.invalidateQueries({ queryKey: keys.reports.all });
    },
  });
}

export function useCreateEntry() {
  return useLedgerMutation<AccountingEntry, Record<string, unknown>>((body) =>
    api.post<AccountingEntry>('accounting/entries', body),
  );
}

export function useVoidEntry(id: string) {
  return useLedgerMutation<AccountingEntry, Record<string, unknown>>((body) =>
    api.post<AccountingEntry>(`accounting/entries/${id}/void`, body),
  );
}

export function useCreateCategory() {
  return useLedgerMutation<ExpenseCategory, Record<string, unknown>>((body) =>
    api.post<ExpenseCategory>('accounting/expense-categories', body),
  );
}

export function useUpdateCategory(id: string) {
  return useLedgerMutation<ExpenseCategory, Record<string, unknown>>((body) =>
    api.patch<ExpenseCategory>(`accounting/expense-categories/${id}`, body),
  );
}

export function useArchiveCategory(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (archive: boolean) =>
      api.post<ExpenseCategory>(
        `accounting/expense-categories/${id}/${archive ? 'archive' : 'reactivate'}`,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.accounting.all }),
  });
}
