'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { keys } from '@/lib/api/keys';
import type { Paginated, Payment, Schemas } from '@/lib/api/types';

export type MemberBilling = Schemas['MemberBillingDto'];
export type MembershipBalance = Schemas['MembershipBalanceDto'];

export interface PaymentQuery extends Record<string, string> {
  page: string;
  limit: string;
  memberId: string;
  membershipId: string;
  method: string;
  status: string;
  from: string;
  to: string;
}

export function toPaymentParams(query: Partial<PaymentQuery>) {
  return {
    page: Number(query.page) || 1,
    limit: Number(query.limit) || 20,
    memberId: query.memberId || undefined,
    membershipId: query.membershipId || undefined,
    method: query.method || undefined,
    status: query.status || undefined,
    from: query.from || undefined,
    to: query.to || undefined,
  };
}

export function usePaymentList(query: Partial<PaymentQuery>) {
  const params = toPaymentParams(query);
  return useQuery({
    queryKey: keys.payments.list(params),
    queryFn: () => api.get<Paginated<Payment>>('payments', { query: params }),
    placeholderData: (previous) => previous,
  });
}

export function usePayment(id: string) {
  return useQuery({
    queryKey: keys.payments.detail(id),
    queryFn: () => api.get<Payment>(`payments/${id}`),
    enabled: Boolean(id),
  });
}

export function useMemberBilling(memberId: string) {
  return useQuery({
    queryKey: keys.billing.member(memberId),
    queryFn: () => api.get<MemberBilling>(`billing/members/${memberId}`),
    enabled: Boolean(memberId),
  });
}

export function useOutstandingBalances(query: { page: string; limit: string; minimumBalance: string }) {
  const params = {
    page: Number(query.page) || 1,
    limit: Number(query.limit) || 20,
    minimumBalance: query.minimumBalance ? Number(query.minimumBalance) : undefined,
  };
  return useQuery({
    queryKey: keys.billing.outstanding(params),
    queryFn: () => api.get<Paginated<MemberBilling>>('billing/outstanding', { query: params }),
    placeholderData: (previous) => previous,
  });
}

/**
 * Taking money or giving it back changes four things at once: the payment
 * record, what the member owes, the ledger, and the dashboard. They are all
 * invalidated together — a screen that showed a payment taken but the old
 * balance beside it would be worse than one that showed neither.
 */
function useMoneyMutation<TBody>(run: (body: TBody) => Promise<Payment>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.payments.all });
      void queryClient.invalidateQueries({ queryKey: keys.billing.all });
      void queryClient.invalidateQueries({ queryKey: keys.accounting.all });
      void queryClient.invalidateQueries({ queryKey: keys.dashboards.admin });
      void queryClient.invalidateQueries({ queryKey: keys.reports.all });
    },
  });
}

export function useTakePayment() {
  return useMoneyMutation((body: Record<string, unknown>) => api.post<Payment>('payments', body));
}

export function useRefundPayment(id: string) {
  return useMoneyMutation((body: Record<string, unknown>) =>
    api.post<Payment>(`payments/${id}/refund`, body),
  );
}
