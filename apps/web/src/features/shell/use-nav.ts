import { useMemo } from 'react';
import { useAuth } from '@/features/auth/use-auth';
import { useTenant } from '@/features/tenant/tenant-context';
import { NAV_ITEMS } from './nav';

/** Navigation filtered by the tenant's enabled features and the user's permissions. */
export function useNavItems() {
  const { isEnabled } = useTenant();
  const { can } = useAuth();
  return useMemo(
    () =>
      NAV_ITEMS.filter(
        (item) =>
          (!item.feature || isEnabled(item.feature)) && (!item.permission || can(item.permission)),
      ),
    [isEnabled, can],
  );
}
