import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateAlertInput } from '@twindesk/core';
import { qk } from '@/app/query-keys';
import { toastError } from '@/lib/mutation';
import { useApi } from '@/platform/api-context';
import { toast } from '@/shared/ui/toast';

export function useAlerts() {
  const api = useApi();
  return useQuery({ queryKey: qk.alerts, queryFn: () => api.alerts.list() });
}

export function useCreateAlert() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAlertInput) => api.alerts.create(input),
    onSuccess: (alert) => {
      toast.success('Alert set', alert.condition);
      void queryClient.invalidateQueries({ queryKey: qk.alerts });
    },
  });
}

export function useSetAlertStatus() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'paused' }) =>
      api.alerts.setStatus(id, status),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.alerts }),
    onError: toastError('Could not update the alert'),
  });
}

export function useRemoveAlert() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.alerts.remove(id),
    onSuccess: () => {
      toast.success('Alert removed');
      void queryClient.invalidateQueries({ queryKey: qk.alerts });
    },
    onError: toastError('Could not remove the alert'),
  });
}

export function useNotifications() {
  const api = useApi();
  return useQuery({
    queryKey: qk.notifications,
    queryFn: () => api.alerts.notifications(),
    refetchInterval: 30_000,
  });
}

export function useMarkNotificationsRead() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.alerts.markRead(ids),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.notifications }),
  });
}
