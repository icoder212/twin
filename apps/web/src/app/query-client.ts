import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { isApiError } from '@twindesk/core';
import { runSessionResets, useSessionStore } from '@/features/auth/session-store';

function onError(error: unknown) {
  // Any call that finds the session gone ends it everywhere in the UI.
  if (
    isApiError(error) &&
    error.code === 'unauthenticated' &&
    useSessionStore.getState().status === 'authenticated'
  ) {
    queryClient.clear();
    runSessionResets();
    useSessionStore.getState().end('expired');
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      // Client errors will not fix themselves; only retry network and server failures.
      retry: (count, error) =>
        !(isApiError(error) && error.status >= 400 && error.status < 500) && count < 2,
    },
    mutations: { retry: false },
  },
});
