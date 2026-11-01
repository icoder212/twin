import { useMemo } from 'react';
import type { FormatLocale } from '@twindesk/core';
import { useTenant } from '@/features/tenant/tenant-context';
import { useSessionStore } from '@/features/auth/session-store';

/** Formatting locale: the tenant's language and currency in the user's own timezone. */
export function useLocale(): FormatLocale {
  const { tenant } = useTenant();
  const timezone = useSessionStore((s) => s.session?.user.timezone);
  return useMemo(
    () => ({
      language: tenant.locale.language,
      currency: tenant.locale.currency,
      timezone: timezone ?? tenant.locale.timezone,
    }),
    [tenant, timezone],
  );
}
