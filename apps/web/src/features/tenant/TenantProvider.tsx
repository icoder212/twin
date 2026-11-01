import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import {
  isFeatureEnabled,
  type ColorScheme,
  type ColorSchemePreference,
  type TenantConfig,
} from '@twindesk/core';
import { preferenceStore } from '@/lib/browser-store';
import { applyTheme } from './theme';
import { rememberTenant } from './resolve-tenant';
import { TenantContext, type TenantContextValue } from './tenant-context';

const SCHEME_KEY = 'twindesk.scheme';
const SCHEME_DEFAULT_KEY = 'twindesk.scheme.default';

function readPreference(tenant: TenantConfig): ColorSchemePreference {
  const saved = preferenceStore.get(SCHEME_KEY);
  return saved === 'dark' || saved === 'light' || saved === 'system'
    ? saved
    : tenant.theme.defaultScheme;
}

function systemScheme(): ColorScheme {
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function TenantProvider({
  tenant,
  children,
}: {
  tenant: TenantConfig;
  children: ReactNode;
}) {
  const [schemePreference, setPreference] = useState<ColorSchemePreference>(() =>
    readPreference(tenant),
  );
  const [system, setSystem] = useState<ColorScheme>(systemScheme);
  const [forced, forceScheme] = useState<ColorScheme | null>(null);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: light)');
    if (!media) return;
    const onChange = () => setSystem(media.matches ? 'light' : 'dark');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const scheme: ColorScheme = forced ?? (schemePreference === 'system' ? system : schemePreference);

  useLayoutEffect(() => {
    applyTheme(document.documentElement, tenant, scheme);
  }, [tenant, scheme]);

  useEffect(() => {
    // Lets the pre-paint script pick the tenant's default before React loads next time.
    preferenceStore.set(SCHEME_DEFAULT_KEY, tenant.theme.defaultScheme);
    document.title = tenant.productName;
  }, [tenant]);

  const setSchemePreference = useCallback((preference: ColorSchemePreference) => {
    preferenceStore.set(SCHEME_KEY, preference);
    setPreference(preference);
  }, []);

  const switchTenant = useCallback((id: string) => {
    rememberTenant(id);
    // A full reload guarantees no state, cache or theme from the previous tenant survives.
    window.location.assign('/login');
  }, []);

  const value = useMemo<TenantContextValue>(
    () => ({
      tenant,
      scheme,
      schemePreference,
      setSchemePreference,
      forceScheme,
      switchTenant,
      isEnabled: (feature) => isFeatureEnabled(tenant, feature),
    }),
    [tenant, scheme, schemePreference, setSchemePreference, switchTenant],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}
