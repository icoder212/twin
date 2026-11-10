import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@twindesk/core';
import { qk } from '@/app/query-keys';
import { useApi } from '@/platform/api-context';
import { toast } from '@/shared/ui/toast';

export function useCalendar(days = 7) {
  const api = useApi();
  return useQuery({
    queryKey: qk.calendar(days),
    queryFn: () => api.calendar.upcoming(days),
    refetchInterval: 60_000,
  });
}

/**
 * Demo builds: takes the pending Google sign-in (started in the click handler so the pop-up is
 * allowed), then marks the Google source connected so the connection is audited.
 */
export function useConnectGoogleCalendar() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (signIn: Promise<void>) => {
      await signIn;
      const source = (await api.sources.list()).find((s) => s.provider === 'google-workspace');
      if (!source) throw new ApiError('not-found', 'There is no Google source to connect.');
      return api.sources.connect({
        sourceId: source.id,
        label: 'Google Calendar',
        confirmReadOnly: true,
      });
    },
    onSuccess: () => {
      toast.success(
        'Google Calendar connected',
        'Read-only. Access stays in this tab for up to an hour.',
      );
      void queryClient.invalidateQueries({ queryKey: qk.sources });
      void queryClient.invalidateQueries({ queryKey: qk.calendarRoot });
      void queryClient.invalidateQueries({ queryKey: qk.notifications });
    },
  });
}
