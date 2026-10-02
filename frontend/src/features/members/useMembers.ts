'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { keys } from '@/lib/api/keys';
import type { Member, Paginated } from '@/lib/api/types';

export interface MemberQuery extends Record<string, string> {
  page: string;
  limit: string;
  search: string;
  status: string;
  gender: string;
  assignedTrainerId: string;
  unassigned: string;
}

/** The query as the backend wants it: numbers as numbers, blanks omitted. */
export function toMemberParams(query: MemberQuery) {
  return {
    page: Number(query.page) || 1,
    limit: Number(query.limit) || 20,
    search: query.search || undefined,
    status: query.status || undefined,
    gender: query.gender || undefined,
    assignedTrainerId: query.assignedTrainerId || undefined,
    unassigned: query.unassigned === 'true' ? true : undefined,
  };
}

export function useMemberList(query: MemberQuery) {
  const params = toMemberParams(query);
  return useQuery({
    queryKey: keys.members.list(params),
    queryFn: () => api.get<Paginated<Member>>('members', { query: params }),
    // Keeps the previous page on screen while the next one loads, so paging
    // does not flash an empty table.
    placeholderData: (previous) => previous,
  });
}

export function useMember(id: string) {
  return useQuery({
    queryKey: keys.members.detail(id),
    queryFn: () => api.get<Member>(`members/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<Member>('members', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.members.all }),
  });
}

export function useUpdateMember(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch<Member>(`members/${id}`, body),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.members.detail(id), updated);
      void queryClient.invalidateQueries({ queryKey: keys.members.all });
    },
  });
}

export function useArchiveMember(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (archive: boolean) =>
      api.post<Member>(`members/${id}/${archive ? 'archive' : 'reactivate'}`),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.members.detail(id), updated);
      void queryClient.invalidateQueries({ queryKey: keys.members.all });
      // An archived member cannot enter, so the door's view changes too.
      void queryClient.invalidateQueries({ queryKey: keys.attendance.all });
      void queryClient.invalidateQueries({ queryKey: keys.dashboards.admin });
    },
  });
}

export function useAssignTrainer(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (trainerId: string | null) =>
      api.patch<Member>(`members/${id}/trainer`, { trainerId }),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.members.detail(id), updated);
      void queryClient.invalidateQueries({ queryKey: keys.members.all });
      void queryClient.invalidateQueries({ queryKey: keys.trainers.all });
    },
  });
}
