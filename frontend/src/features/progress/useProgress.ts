'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { keys } from '@/lib/api/keys';
import type { Measurement, Paginated, Schemas } from '@/lib/api/types';

export type MemberProgress = Schemas['MemberProgressDto'];
export type MetricProgress = Schemas['MetricProgressDto'];

export function useMemberProgress(memberId: string) {
  return useQuery({
    queryKey: keys.measurements.progress(memberId),
    queryFn: () => api.get<MemberProgress>(`measurements/progress/members/${memberId}`),
    enabled: Boolean(memberId),
  });
}

export function useMyProgress() {
  return useQuery({
    queryKey: keys.measurements.progressMe,
    queryFn: () => api.get<MemberProgress>('measurements/progress/me'),
  });
}

export function useMeasurementList(query: { memberId?: string; page?: string; limit?: string }) {
  const params = {
    page: Number(query.page) || 1,
    limit: Number(query.limit) || 50,
    memberId: query.memberId || undefined,
  };
  return useQuery({
    queryKey: keys.measurements.list(params),
    queryFn: () => api.get<Paginated<Measurement>>('measurements', { query: params }),
  });
}

function useMeasurementMutation<TBody, TResult>(run: (body: TBody) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.measurements.all });
    },
  });
}

export function useCreateMeasurement() {
  return useMeasurementMutation<Record<string, unknown>, Measurement>((body) =>
    api.post<Measurement>('measurements', body),
  );
}

export function useUpdateMeasurement(id: string) {
  return useMeasurementMutation<Record<string, unknown>, Measurement>((body) =>
    api.patch<Measurement>(`measurements/${id}`, body),
  );
}

export function useDeleteMeasurement() {
  return useMeasurementMutation<string, void>((id) => api.delete<void>(`measurements/${id}`));
}
