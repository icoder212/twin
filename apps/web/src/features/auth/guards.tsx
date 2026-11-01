import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import type { FeatureKey, Permission } from '@twindesk/core';
import { useTenant } from '@/features/tenant/tenant-context';
import { ForbiddenState } from '@/shared/components/ForbiddenState';
import { NotFoundPage } from '@/shared/components/NotFoundPage';
import { SplashScreen } from '@/shared/components/SplashScreen';
import { useSessionStore } from './session-store';
import { useAuth } from './use-auth';

/** Route guard. The server rejects unauthenticated calls anyway; this keeps the UI honest. */
export function RequireAuth() {
  const status = useSessionStore((s) => s.status);
  const endReason = useSessionStore((s) => s.endReason);
  const location = useLocation();
  if (status === 'loading') return <SplashScreen />;
  if (status === 'anonymous') {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search, reason: endReason }}
      />
    );
  }
  return <Outlet />;
}

export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const status = useSessionStore((s) => s.status);
  const location = useLocation();
  if (status === 'loading') return <SplashScreen />;
  if (status === 'authenticated') {
    const from = (location.state as { from?: string } | null)?.from;
    // Only same-app paths are accepted, so a crafted link cannot redirect off-site after sign-in.
    const target = from && from.startsWith('/') && !from.startsWith('//') ? from : '/desk';
    return <Navigate to={target} replace />;
  }
  return children;
}

export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const { can } = useAuth();
  return can(permission) ? children : <ForbiddenState />;
}

export function RequireFeature({
  feature,
  children,
}: {
  feature: FeatureKey;
  children: ReactNode;
}) {
  const { isEnabled } = useTenant();
  return isEnabled(feature) ? children : <NotFoundPage />;
}

/** Renders children only when the signed-in role has the permission. */
export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can } = useAuth();
  return can(permission) ? children : fallback;
}
