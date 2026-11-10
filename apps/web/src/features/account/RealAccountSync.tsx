import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { qk } from '@/app/query-keys';
import { toast } from '@/shared/ui/toast';
import { refreshRealAccount, useRealAccount } from './real-account';

/**
 * Checks for the owner's real account once, refetches the notification screens whenever their
 * source switches between the demo and the server, and greets the return from Google sign-in.
 */
export function RealAccountSync() {
  const queryClient = useQueryClient();
  const signedIn = useRealAccount((s) => s.status.signedIn);
  const [params, setParams] = useSearchParams();
  const first = useRef(true);

  useEffect(() => {
    void refreshRealAccount();
  }, []);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    void queryClient.invalidateQueries({ queryKey: qk.notifyRoot });
    void queryClient.invalidateQueries({ queryKey: qk.notifications });
  }, [signedIn, queryClient]);

  useEffect(() => {
    if (params.get('account') !== 'connected') return;
    toast.success('Signed in with Google', 'You are now seeing your real notifications.');
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('account');
        return next;
      },
      { replace: true },
    );
  }, [params, setParams]);

  return null;
}
