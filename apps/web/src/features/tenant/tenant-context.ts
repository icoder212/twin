import { createContext, useContext } from 'react';
import type { ColorScheme, ColorSchemePreference, FeatureKey, TenantConfig } from '@twindesk/core';

export interface TenantContextValue {
  tenant: TenantConfig;
  scheme: ColorScheme;
  schemePreference: ColorSchemePreference;
  setSchemePreference: (preference: ColorSchemePreference) => void;
  /** Overrides the scheme without saving a preference (used by embedding hosts). */
  forceScheme: (scheme: ColorScheme | null) => void;
  /** Demo only: reloads the app under another white-label tenant. */
  switchTenant: (id: string) => void;
  isEnabled: (feature: FeatureKey) => boolean;
}

export const TenantContext = createContext<TenantContextValue | null>(null);

export function useTenant(): TenantContextValue {
  const value = useContext(TenantContext);
  if (!value) throw new Error('useTenant must be used inside <TenantProvider>');
  return value;
}
