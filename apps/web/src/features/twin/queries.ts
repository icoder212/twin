import { useQuery } from '@tanstack/react-query';
import type { DeskType } from '@twindesk/core';
import { qk } from '@/app/query-keys';
import { useApi } from '@/platform/api-context';

export function useSuggestions(deskType: DeskType) {
  const api = useApi();
  return useQuery({
    queryKey: qk.suggestions(deskType),
    queryFn: () => api.twin.suggestions(deskType),
    staleTime: Infinity,
  });
}
