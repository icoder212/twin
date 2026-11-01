import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { createMemoryStore, getTenantPreset } from '@twindesk/core';
import { createMockApi } from '@twindesk/core/mock';
import { TenantProvider } from '@/features/tenant/TenantProvider';
import { ApiContext } from '@/platform/api-context';
import { TooltipProvider } from '@/shared/ui/menu';

/** Renders with the real providers, an instant mock API and a fresh cache per test. */
export function renderWithApp(ui: ReactElement, { tenantId = 'alchmai', route = '/' } = {}) {
  const tenant = getTenantPreset(tenantId);
  const api = createMockApi({ tenant, store: createMemoryStore(), speed: 0 });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TenantProvider tenant={tenant}>
      <ApiContext.Provider value={api}>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
          </TooltipProvider>
        </QueryClientProvider>
      </ApiContext.Provider>
    </TenantProvider>
  );
  return { api, queryClient, ...render(ui, { wrapper }) };
}
