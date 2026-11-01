import { useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/platform/api-context';
import { onSignOutElsewhere } from './broadcast';
import { runSessionResets, useSessionStore } from './session-store';

/** Restores the session on load, re-checks it when the tab regains focus, and follows other tabs. */
export function AuthBootstrap({ children }: { children: ReactNode }) {
  const api = useApi();
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    api.auth
      .getSession()
      .then((session) => {
        if (cancelled) return;
        if (session) useSessionStore.getState().setSession(session);
        else useSessionStore.getState().end(null);
      })
      .catch(() => {
        if (!cancelled) useSessionStore.getState().end(null);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    const recheck = () => {
      if (
        document.visibilityState !== 'visible' ||
        useSessionStore.getState().status !== 'authenticated'
      )
        return;
      api.auth
        .getSession()
        .then((session) => {
          if (!session && useSessionStore.getState().status === 'authenticated') {
            queryClient.clear();
            runSessionResets();
            useSessionStore.getState().end('expired');
          }
        })
        .catch(() => undefined);
    };
    document.addEventListener('visibilitychange', recheck);
    const stop = onSignOutElsewhere(() => {
      queryClient.clear();
      runSessionResets();
      useSessionStore.getState().end('other-tab');
    });
    return () => {
      document.removeEventListener('visibilitychange', recheck);
      stop();
    };
  }, [api, queryClient]);

  return children;
}
