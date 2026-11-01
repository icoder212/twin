import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { can as canRole, type Permission } from '@twindesk/core';
import { useApi } from '@/platform/api-context';
import { broadcastSignOut } from './broadcast';
import { runSessionResets, useSessionStore, type EndReason } from './session-store';

export function useAuth() {
  const api = useApi();
  const queryClient = useQueryClient();
  const session = useSessionStore((s) => s.session);
  const status = useSessionStore((s) => s.status);

  const signOut = useCallback(
    async (reason: EndReason = 'user') => {
      try {
        await api.auth.logout(
          reason === 'timeout' ? 'timeout' : reason === 'expired' ? 'expired' : 'user',
        );
      } catch {
        // Signing out locally must succeed even if the server cannot be reached.
      }
      // Drop every cached response so the next user on this device sees nothing of this one.
      queryClient.clear();
      runSessionResets();
      if (reason !== 'other-tab') broadcastSignOut();
      useSessionStore.getState().end(reason);
    },
    [api, queryClient],
  );

  const can = useCallback(
    (permission: Permission) => canRole(session?.user.role, permission),
    [session],
  );

  return { session, user: session?.user ?? null, status, signOut, can };
}
