import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router';
import type { TenantConfig } from '@twindesk/core';
import { AuthBootstrap } from '@/features/auth/AuthBootstrap';
import { useSessionStore } from '@/features/auth/session-store';
import { TenantProvider } from '@/features/tenant/TenantProvider';
import { logger } from '@/lib/logger';
import { ApiContext } from '@/platform/api-context';
import { createApi, type AppApi } from '@/platform/create-api';
import { SplashScreen } from '@/shared/components/SplashScreen';
import { TooltipProvider } from '@/shared/ui/menu';
import { Toaster } from '@/shared/ui/toast';
import { queryClient } from './query-client';
import { router } from './router';

export function App({ tenant }: { tenant: TenantConfig }) {
  const [api, setApi] = useState<AppApi | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    createApi(tenant, () => useSessionStore.getState().end('expired'))
      .then((created) => {
        if (!cancelled) setApi(created);
      })
      .catch((error: unknown) => {
        logger.error('Could not start the API client', error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [tenant]);

  return (
    <TenantProvider tenant={tenant}>
      {failed ? (
        <SplashScreen label="We could not start the app. Please reload." />
      ) : !api ? (
        <SplashScreen />
      ) : (
        <ApiContext.Provider value={api}>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider delayDuration={300}>
              <AuthBootstrap>
                <RouterProvider router={router} />
              </AuthBootstrap>
              <Toaster />
            </TooltipProvider>
          </QueryClientProvider>
        </ApiContext.Provider>
      )}
    </TenantProvider>
  );
}
