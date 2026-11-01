import {
  getTenantPreset,
  TENANT_PRESETS,
  tenantConfigSchema,
  type TenantConfig,
} from '@twindesk/core';
import { env } from '@/app/env';
import { preferenceStore } from '@/lib/browser-store';

const TENANT_KEY = 'twindesk.tenant';

/** Production hostnames map to tenants; the server will own this map. */
const HOSTNAMES: Record<string, string> = {};

/**
 * Works out which white-label tenant to load. In production the tenant comes from the hostname
 * (and the backend serves its config). In demo builds it can be switched with ?tenant= or from
 * Settings, so one deployment can show every brand to a prospect.
 */
export function resolveTenantId(): string {
  const host = HOSTNAMES[window.location.hostname];
  if (host) return host;
  if (env.demoMode) {
    const fromQuery = new URLSearchParams(window.location.search).get('tenant');
    if (fromQuery && TENANT_PRESETS[fromQuery]) {
      preferenceStore.set(TENANT_KEY, fromQuery);
      return fromQuery;
    }
    const saved = preferenceStore.get(TENANT_KEY);
    if (saved && TENANT_PRESETS[saved]) return saved;
  }
  return env.defaultTenant;
}

export function loadTenant(id: string): TenantConfig {
  // Validated again here: in production this object arrives over the network.
  return tenantConfigSchema.parse(getTenantPreset(id));
}

export function rememberTenant(id: string): void {
  preferenceStore.set(TENANT_KEY, id);
}
