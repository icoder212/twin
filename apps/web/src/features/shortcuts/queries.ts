import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@/app/query-keys';
import { toastError } from '@/lib/mutation';
import { useApi } from '@/platform/api-context';
import { toast } from '@/shared/ui/toast';

export function useShortcuts() {
  const api = useApi();
  return useQuery({
    queryKey: qk.shortcuts,
    queryFn: () => api.shortcuts.list(),
    staleTime: 5 * 60_000,
  });
}

export function useRemoveShortcut() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.shortcuts.remove(id),
    onSuccess: () => {
      toast.success('Shortcut removed');
      void queryClient.invalidateQueries({ queryKey: qk.shortcuts });
    },
    onError: toastError('Could not remove the shortcut'),
  });
}
