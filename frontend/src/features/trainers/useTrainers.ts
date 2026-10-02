'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { keys } from '@/lib/api/keys';
import type { Member, Paginated, Trainer } from '@/lib/api/types';

export interface TrainerQuery extends Record<string, string> {
  page: string;
  limit: string;
  search: string;
  status: string;
}

export function toTrainerParams(query: TrainerQuery) {
  return {
    page: Number(query.page) || 1,
    limit: Number(query.limit) || 20,
    search: query.search || undefined,
    status: query.status || undefined,
  };
}

export function useTrainerList(query: TrainerQuery) {
  const params = toTrainerParams(query);
  return useQuery({
    queryKey: keys.trainers.list(params),
    queryFn: () => api.get<Paginated<Trainer>>('trainers', { query: params }),
    placeholderData: (previous) => previous,
  });
}

export function useTrainer(id: string) {
  return useQuery({
    queryKey: keys.trainers.detail(id),
    queryFn: () => api.get<Trainer>(`trainers/${id}`),
    enabled: Boolean(id),
  });
}

export function useTrainerMembers(id: string) {
  return useQuery({
    queryKey: keys.trainers.members(id),
    queryFn: () => api.get<Paginated<Member>>(`trainers/${id}/members`, { query: { limit: 100 } }),
    enabled: Boolean(id),
  });
}

export function useCreateTrainer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<Trainer>('trainers', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.trainers.all }),
  });
}

export function useUpdateTrainer(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch<Trainer>(`trainers/${id}`, body),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.trainers.detail(id), updated);
      void queryClient.invalidateQueries({ queryKey: keys.trainers.all });
    },
  });
}

export function useArchiveTrainer(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (archive: boolean) =>
      api.post<Trainer>(`trainers/${id}/${archive ? 'archive' : 'reactivate'}`),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.trainers.detail(id), updated);
      void queryClient.invalidateQueries({ queryKey: keys.trainers.all });
      // Members keep their assignment, but the directory shows the new status.
      void queryClient.invalidateQueries({ queryKey: keys.members.all });
    },
  });
}

export function useUpdateCompensation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch<Trainer>(`trainers/${id}/compensation`, body),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.trainers.detail(id), updated);
      void queryClient.invalidateQueries({ queryKey: keys.trainers.all });
    },
  });
}
