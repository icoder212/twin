import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConnectSourceInput, ConnectedSource } from '@twindesk/core';
import { qk } from '@/app/query-keys';
import { toastError } from '@/lib/mutation';
import { useApi } from '@/platform/api-context';
import { toast } from '@/shared/ui/toast';

export function useSources() {
  const api = useApi();
  return useQuery({ queryKey: qk.sources, queryFn: () => api.sources.list() });
}

export function useConnectSource() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ConnectSourceInput) => api.sources.connect(input),
    onSuccess: (source) => {
      toast.success(
        `${source.name} connected`,
        'Read-only. The key is in the vault and never shown again.',
      );
      void queryClient.invalidateQueries({ queryKey: qk.sources });
    },
  });
}

export function useRevokeSource() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.sources.revoke(id),
    onSuccess: (source) => {
      toast.success(`Access to ${source.name} revoked`);
      void queryClient.invalidateQueries({ queryKey: qk.sources });
    },
    onError: toastError('Could not revoke access'),
  });
}

export function useSyncSource() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.sources.sync(id),
    onSuccess: (source) => {
      toast.success(`${source.name} is up to date`);
      void queryClient.invalidateQueries({ queryKey: qk.sources });
    },
    onError: toastError('Could not fetch'),
  });
}

export function useSetAlertOnDisconnect() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.sources.setAlertOnDisconnect(id, enabled),
    // Flip the switch straight away; roll back if the server refuses.
    onMutate: async ({ id, enabled }) => {
      await queryClient.cancelQueries({ queryKey: qk.sources });
      const previous = queryClient.getQueryData<ConnectedSource[]>(qk.sources);
      queryClient.setQueryData<ConnectedSource[]>(qk.sources, (list) =>
        list?.map((s) => (s.id === id ? { ...s, alertOnDisconnect: enabled } : s)),
      );
      return { previous };
    },
    onSuccess: (source) => {
      toast.success(
        source.alertOnDisconnect
          ? `Disconnect alerts on for ${source.name}`
          : `Disconnect alerts off for ${source.name}`,
        source.alertOnDisconnect
          ? 'A critical notification goes out through your delivery settings if it stops fetching.'
          : undefined,
      );
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(qk.sources, context.previous);
      toastError('Could not change the alert')(error);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: qk.sources }),
  });
}
