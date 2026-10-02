'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { keys } from '@/lib/api/keys';
import type { Paginated, TrainingSession } from '@/lib/api/types';

export interface SessionQuery extends Record<string, string> {
  page: string;
  limit: string;
  memberId: string;
  trainerId: string;
  status: string;
  from: string;
  to: string;
}

export function useSessionList(query: Partial<SessionQuery>) {
  const params = {
    page: Number(query.page) || 1,
    limit: Number(query.limit) || 20,
    memberId: query.memberId || undefined,
    trainerId: query.trainerId || undefined,
    status: query.status || undefined,
    from: query.from || undefined,
    to: query.to || undefined,
  };
  return useQuery({
    queryKey: keys.sessions.list(params),
    queryFn: () => api.get<Paginated<TrainingSession>>('training-sessions', { query: params }),
    placeholderData: (previous) => previous,
  });
}

export function useMySessions(query: Partial<SessionQuery> = {}) {
  const params = {
    page: Number(query.page) || 1,
    limit: Number(query.limit) || 20,
    status: query.status || undefined,
    from: query.from || undefined,
    to: query.to || undefined,
  };
  return useQuery({
    queryKey: keys.sessions.me(params),
    queryFn: () => api.get<Paginated<TrainingSession>>('training-sessions/me', { query: params }),
  });
}

function useSessionMutation<TBody>(run: (body: TBody) => Promise<TrainingSession>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: (session) => {
      queryClient.setQueryData(keys.sessions.detail(session.id), session);
      void queryClient.invalidateQueries({ queryKey: keys.sessions.all });
      void queryClient.invalidateQueries({ queryKey: keys.dashboards.trainer });
      void queryClient.invalidateQueries({ queryKey: keys.dashboards.admin });
    },
  });
}

export function useCreateSession() {
  return useSessionMutation((body: Record<string, unknown>) =>
    api.post<TrainingSession>('training-sessions', body),
  );
}

export function useRescheduleSession(id: string) {
  return useSessionMutation((body: Record<string, unknown>) =>
    api.patch<TrainingSession>(`training-sessions/${id}`, body),
  );
}

export function useCompleteSession(id: string) {
  return useSessionMutation((body: Record<string, unknown>) =>
    api.post<TrainingSession>(`training-sessions/${id}/complete`, body),
  );
}

export function useCancelSession(id: string) {
  return useSessionMutation((body: Record<string, unknown>) =>
    api.post<TrainingSession>(`training-sessions/${id}/cancel`, body),
  );
}

export function useNoShowSession(id: string) {
  return useSessionMutation(() => api.post<TrainingSession>(`training-sessions/${id}/no-show`));
}
