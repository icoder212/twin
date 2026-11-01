import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConnectSourceInput } from '@twindesk/core';
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
