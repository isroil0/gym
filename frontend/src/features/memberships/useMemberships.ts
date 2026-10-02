'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { keys } from '@/lib/api/keys';
import type { Membership, MembershipPlan, Paginated } from '@/lib/api/types';

export interface MembershipQuery extends Record<string, string> {
  page: string;
  limit: string;
  memberId: string;
  planId: string;
  status: string;
  endingBefore: string;
  endingAfter: string;
}

export function toMembershipParams(query: Partial<MembershipQuery>) {
  return {
    page: Number(query.page) || 1,
    limit: Number(query.limit) || 20,
    memberId: query.memberId || undefined,
    planId: query.planId || undefined,
    status: query.status || undefined,
    endingBefore: query.endingBefore || undefined,
    endingAfter: query.endingAfter || undefined,
  };
}

export function useMembershipList(query: Partial<MembershipQuery>) {
  const params = toMembershipParams(query);
  return useQuery({
    queryKey: keys.memberships.list(params),
    queryFn: () => api.get<Paginated<Membership>>('memberships', { query: params }),
    placeholderData: (previous) => previous,
  });
}

export function useMembership(id: string) {
  return useQuery({
    queryKey: keys.memberships.detail(id),
    queryFn: () => api.get<Membership>(`memberships/${id}`),
    enabled: Boolean(id),
  });
}

export function usePlans(options: { status?: string; limit?: number } = {}) {
  const params = { limit: options.limit ?? 100, status: options.status || undefined };
  return useQuery({
    queryKey: keys.plans.list(params),
    queryFn: () => api.get<Paginated<MembershipPlan>>('membership-plans', { query: params }),
    staleTime: 5 * 60_000,
  });
}

/**
 * Everything a membership change touches.
 *
 * Selling, renewing, freezing or cancelling all move money, entitlement and
 * the door's answer at once, so the caches for memberships, billing, the
 * member record and the dashboard are all dropped together. Refreshing one
 * and not the others is how a screen ends up contradicting itself.
 */
function useMembershipMutation<TBody>(
  run: (body: TBody) => Promise<Membership>,
  memberId?: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: (membership) => {
      queryClient.setQueryData(keys.memberships.detail(membership.id), membership);
      void queryClient.invalidateQueries({ queryKey: keys.memberships.all });
      void queryClient.invalidateQueries({ queryKey: keys.billing.all });
      void queryClient.invalidateQueries({ queryKey: keys.dashboards.admin });
      if (memberId) void queryClient.invalidateQueries({ queryKey: keys.members.detail(memberId) });
      void queryClient.invalidateQueries({ queryKey: keys.members.all });
    },
  });
}

export function useSellMembership(memberId?: string) {
  return useMembershipMutation(
    (body: Record<string, unknown>) => api.post<Membership>('memberships', body),
    memberId,
  );
}

export function useRenewMembership(id: string, memberId?: string) {
  return useMembershipMutation(
    (body: Record<string, unknown>) => api.post<Membership>(`memberships/${id}/renew`, body),
    memberId,
  );
}

export function useFreezeMembership(id: string, memberId?: string) {
  return useMembershipMutation(
    (body: Record<string, unknown>) => api.post<Membership>(`memberships/${id}/freeze`, body),
    memberId,
  );
}

export function useUnfreezeMembership(id: string, memberId?: string) {
  return useMembershipMutation(
    () => api.post<Membership>(`memberships/${id}/unfreeze`),
    memberId,
  );
}

export function useExtendMembership(id: string, memberId?: string) {
  return useMembershipMutation(
    (body: Record<string, unknown>) => api.post<Membership>(`memberships/${id}/extend`, body),
    memberId,
  );
}

export function useCancelMembership(id: string, memberId?: string) {
  return useMembershipMutation(
    (body: Record<string, unknown>) => api.post<Membership>(`memberships/${id}/cancel`, body),
    memberId,
  );
}

export function useApplyDiscount(id: string, memberId?: string) {
  return useMembershipMutation(
    (body: Record<string, unknown>) => api.post<Membership>(`memberships/${id}/discount`, body),
    memberId,
  );
}

// ---- Plans ------------------------------------------------------------------

export function usePlanList(query: { page: string; limit: string; search: string; status: string }) {
  const params = {
    page: Number(query.page) || 1,
    limit: Number(query.limit) || 20,
    search: query.search || undefined,
    status: query.status || undefined,
  };
  return useQuery({
    queryKey: keys.plans.list(params),
    queryFn: () => api.get<Paginated<MembershipPlan>>('membership-plans', { query: params }),
    placeholderData: (previous) => previous,
  });
}

function usePlanMutation(run: (body: Record<string, unknown>) => Promise<MembershipPlan>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.plans.all }),
  });
}

export function useCreatePlan() {
  return usePlanMutation((body) => api.post<MembershipPlan>('membership-plans', body));
}

export function useUpdatePlan(id: string) {
  return usePlanMutation((body) => api.patch<MembershipPlan>(`membership-plans/${id}`, body));
}

export function useArchivePlan(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (archive: boolean) =>
      api.post<MembershipPlan>(`membership-plans/${id}/${archive ? 'archive' : 'reactivate'}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.plans.all }),
  });
}
