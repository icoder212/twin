import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DeskOverview } from '@twindesk/core';
import { qk } from '@/app/query-keys';
import { toastError } from '@/lib/mutation';
import { useApi } from '@/platform/api-context';

export function useOverview() {
  const api = useApi();
  return useQuery({
    queryKey: qk.overview,
    queryFn: () => api.desk.overview(),
    refetchInterval: 60_000,
  });
}

export function useToggleActionItem() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) =>
      api.desk.setActionItemDone(id, done),
    // Optimistic: ticking an item should feel instant.
    onMutate: async ({ id, done }) => {
      await queryClient.cancelQueries({ queryKey: qk.overview });
      const previous = queryClient.getQueryData<DeskOverview>(qk.overview);
      if (previous) {
        queryClient.setQueryData<DeskOverview>(qk.overview, {
          ...previous,
          actionItems: previous.actionItems.map((i) => (i.id === id ? { ...i, done } : i)),
        });
      }
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(qk.overview, context.previous);
      toastError('Could not update the item')(error);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.overview }),
  });
}
