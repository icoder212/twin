import { createHttpApi, type TenantConfig, type TwinDeskApi } from '@twindesk/core';
import { env } from '@/app/env';
import { sessionStore } from '@/lib/browser-store';

export type AppApi = TwinDeskApi & { resetDemoData?: () => void };

function readCookie(name: string): string | null {
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

/**
 * Picks the adapter for this build. The mock is loaded as a separate chunk, so a production
 * build pointed at the real API never downloads the demo backend.
 */
export async function createApi(
  tenant: TenantConfig,
  onUnauthenticated: () => void,
): Promise<AppApi> {
  // A static comparison, so builds for the real API drop the demo backend (and its demo
  // credentials) from the output entirely rather than just never loading it.
  if (import.meta.env.VITE_API_MODE !== 'http') {
    const { createMockApi } = await import('@twindesk/core/mock');
    return createMockApi({ tenant, store: sessionStore, speed: 1 });
  }
  if (!env.apiBaseUrl) throw new Error('VITE_API_BASE_URL is required when VITE_API_MODE=http');
  return createHttpApi({
    baseUrl: env.apiBaseUrl,
    tenantId: tenant.id,
    getCsrfToken: () => readCookie('twindesk_csrf'),
    onUnauthenticated,
  });
}
