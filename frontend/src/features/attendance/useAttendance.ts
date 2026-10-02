'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { keys } from '@/lib/api/keys';
import type { Attendance, MembershipCard, Paginated, Schemas } from '@/lib/api/types';

export type CheckInResult = Schemas['CheckInResultDto'];
export type TodayAttendance = Schemas['TodayAttendanceDto'];

export interface AttendanceQuery extends Record<string, string> {
  page: string;
  limit: string;
  memberId: string;
  method: string;
  from: string;
  to: string;
}

export function useTodayAttendance() {
  return useQuery({
    queryKey: keys.attendance.today,
    queryFn: () => api.get<TodayAttendance>('attendance/today'),
    // The front desk leaves this on screen; a minute is fresh enough without
    // hammering the API all day.
    refetchInterval: 60_000,
  });
}

export function useAttendanceList(query: Partial<AttendanceQuery>) {
  const params = {
    page: Number(query.page) || 1,
    limit: Number(query.limit) || 20,
    memberId: query.memberId || undefined,
    method: query.method || undefined,
    from: query.from || undefined,
    to: query.to || undefined,
  };
  return useQuery({
    queryKey: keys.attendance.list(params),
    queryFn: () => api.get<Paginated<Attendance>>('attendance', { query: params }),
    placeholderData: (previous) => previous,
  });
}

/**
 * Admitting somebody changes today's list, their visit allowance and the
 * dashboard's count, so all three are refreshed. The backend decides whether
 * they may enter; this only records what it decided.
 */
function useDoorMutation<TBody, TResult>(run: (body: TBody) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.attendance.all });
      void queryClient.invalidateQueries({ queryKey: keys.memberships.all });
      void queryClient.invalidateQueries({ queryKey: keys.dashboards.admin });
    },
  });
}

export function useManualCheckIn() {
  return useDoorMutation((body: { memberId: string; notes?: string }) =>
    api.post<CheckInResult>('attendance/check-in', body),
  );
}

export function useMemberCard(memberId: string, enabled = true) {
  return useQuery({
    queryKey: keys.cards.member(memberId),
    queryFn: () => api.get<MembershipCard>(`membership-cards/members/${memberId}`),
    enabled: enabled && Boolean(memberId),
    retry: false,
  });
}

export function useMyCard() {
  return useQuery({
    queryKey: keys.cards.me,
    queryFn: () => api.get<MembershipCard>('membership-cards/me'),
  });
}

export function useCardActions(memberId?: string) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: keys.cards.all });
  };

  const regenerate = useMutation({
    mutationFn: () =>
      api.post<MembershipCard>(
        memberId ? `membership-cards/members/${memberId}/regenerate` : 'membership-cards/me/regenerate',
      ),
    onSuccess: invalidate,
  });

  const revoke = useMutation({
    mutationFn: (reason?: string) =>
      api.post<MembershipCard>(
        `membership-cards/members/${memberId}/revoke`,
        reason ? { reason } : {},
      ),
    onSuccess: invalidate,
  });

  return { regenerate, revoke };
}
