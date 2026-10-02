'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { keys } from '@/lib/api/keys';
import type { Paginated, WorkoutPlan } from '@/lib/api/types';

export interface WorkoutQuery extends Record<string, string> {
  page: string;
  limit: string;
  memberId: string;
  trainerId: string;
  status: string;
}

export function useWorkoutPlanList(query: Partial<WorkoutQuery>) {
  const params = {
    page: Number(query.page) || 1,
    limit: Number(query.limit) || 20,
    memberId: query.memberId || undefined,
    trainerId: query.trainerId || undefined,
    status: query.status || undefined,
  };
  return useQuery({
    queryKey: keys.workouts.list(params),
    queryFn: () => api.get<Paginated<WorkoutPlan>>('workout-plans', { query: params }),
    placeholderData: (previous) => previous,
  });
}

export function useWorkoutPlan(id: string) {
  return useQuery({
    queryKey: keys.workouts.detail(id),
    queryFn: () => api.get<WorkoutPlan>(`workout-plans/${id}`),
    enabled: Boolean(id),
  });
}

export function useMyWorkoutPlans() {
  return useQuery({
    queryKey: keys.workouts.me,
    queryFn: () => api.get<Paginated<WorkoutPlan>>('workout-plans/me'),
  });
}

/**
 * Days and exercises are edited inside a plan, and every one of those
 * endpoints returns the whole plan back. Writing that straight into the cache
 * means the screen updates from the server's own answer rather than from a
 * guess about what the edit did.
 */
function usePlanMutation<TBody>(run: (body: TBody) => Promise<WorkoutPlan>, planId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: (plan) => {
      queryClient.setQueryData(keys.workouts.detail(plan.id ?? planId ?? ''), plan);
      void queryClient.invalidateQueries({ queryKey: keys.workouts.all });
      void queryClient.invalidateQueries({ queryKey: keys.dashboards.trainer });
    },
  });
}

export function useCreateWorkoutPlan() {
  return usePlanMutation((body: Record<string, unknown>) => api.post<WorkoutPlan>('workout-plans', body));
}

export function useUpdateWorkoutPlan(id: string) {
  return usePlanMutation(
    (body: Record<string, unknown>) => api.patch<WorkoutPlan>(`workout-plans/${id}`, body),
    id,
  );
}

export function useArchiveWorkoutPlan(id: string) {
  return usePlanMutation(
    (archive: boolean) =>
      api.post<WorkoutPlan>(`workout-plans/${id}/${archive ? 'archive' : 'reactivate'}`),
    id,
  );
}

export function useAddDay(planId: string) {
  return usePlanMutation(
    (body: Record<string, unknown>) => api.post<WorkoutPlan>(`workout-plans/${planId}/days`, body),
    planId,
  );
}

export function useUpdateDay(planId: string, dayId: string) {
  return usePlanMutation(
    (body: Record<string, unknown>) =>
      api.patch<WorkoutPlan>(`workout-plans/${planId}/days/${dayId}`, body),
    planId,
  );
}

export function useDeleteDay(planId: string) {
  return usePlanMutation(
    (dayId: string) => api.delete<WorkoutPlan>(`workout-plans/${planId}/days/${dayId}`),
    planId,
  );
}

export function useAddExercise(planId: string, dayId: string) {
  return usePlanMutation(
    (body: Record<string, unknown>) =>
      api.post<WorkoutPlan>(`workout-plans/${planId}/days/${dayId}/exercises`, body),
    planId,
  );
}

export function useUpdateExercise(planId: string, dayId: string, exerciseId: string) {
  return usePlanMutation(
    (body: Record<string, unknown>) =>
      api.patch<WorkoutPlan>(`workout-plans/${planId}/days/${dayId}/exercises/${exerciseId}`, body),
    planId,
  );
}

export function useDeleteExercise(planId: string, dayId: string) {
  return usePlanMutation(
    (exerciseId: string) =>
      api.delete<WorkoutPlan>(`workout-plans/${planId}/days/${dayId}/exercises/${exerciseId}`),
    planId,
  );
}
