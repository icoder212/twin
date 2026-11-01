import { createBrowserRouter, Navigate, Outlet } from 'react-router';
import {
  RedirectIfAuthenticated,
  RequireAuth,
  RequireFeature,
  RequirePermission,
} from '@/features/auth/guards';
import { RouteError } from '@/shared/components/RouteError';
import { NotFoundPage } from '@/shared/components/NotFoundPage';
import { SplashScreen } from '@/shared/components/SplashScreen';

/**
 * Routes are code-split per feature. Guards here shape the UI only; the API enforces the same
 * authentication, permissions and feature flags on every request.
 */
export const router = createBrowserRouter([
  {
    errorElement: <RouteError />,
    hydrateFallbackElement: <SplashScreen />,
    children: [
      {
        path: '/login',
        lazy: async () => {
          const { LoginPage } = await import('@/features/auth/LoginPage');
          return {
            Component: () => (
              <RedirectIfAuthenticated>
                <LoginPage />
              </RedirectIfAuthenticated>
            ),
          };
        },
      },
      {
        element: <RequireAuth />,
        children: [
          {
            path: '/embed',
            lazy: async () => ({
              Component: (await import('@/features/embed/EmbedLayout')).EmbedLayout,
            }),
            children: [
              {
                path: 'twin',
                lazy: async () => ({
                  Component: (await import('@/features/twin/TwinPage')).EmbeddedTwinPage,
                }),
              },
            ],
          },
          {
            lazy: async () => ({ Component: (await import('@/features/shell/AppShell')).AppShell }),
            children: [
              { index: true, element: <Navigate to="/desk" replace /> },
              {
                path: 'desk',
                lazy: async () => ({
                  Component: (await import('@/features/dashboard/DashboardPage')).DashboardPage,
                }),
              },
              {
                path: 'twin',
                lazy: async () => {
                  const { TwinPage } = await import('@/features/twin/TwinPage');
                  return {
                    Component: () => (
                      <RequireFeature feature="twin">
                        <TwinPage />
                      </RequireFeature>
                    ),
                  };
                },
              },
              {
                path: 'tasks',
                element: (
                  <RequireFeature feature="tasks">
                    <Outlet />
                  </RequireFeature>
                ),
                children: [
                  {
                    index: true,
                    lazy: async () => ({
                      Component: (await import('@/features/automations/AutomationsPage')).TasksPage,
                    }),
                  },
                  {
                    path: ':id',
                    lazy: async () => ({
                      Component: (await import('@/features/automations/AutomationDetailPage'))
                        .AutomationDetailPage,
                    }),
                  },
                ],
              },
              {
                path: 'workflows',
                element: (
                  <RequireFeature feature="workflows">
                    <Outlet />
                  </RequireFeature>
                ),
                children: [
                  {
                    index: true,
                    lazy: async () => ({
                      Component: (await import('@/features/automations/AutomationsPage'))
                        .WorkflowsPage,
                    }),
                  },
                  {
                    path: ':id',
                    lazy: async () => ({
                      Component: (await import('@/features/automations/AutomationDetailPage'))
                        .AutomationDetailPage,
                    }),
                  },
                ],
              },
              {
                path: 'shortcuts',
                lazy: async () => {
                  const { ShortcutsPage } = await import('@/features/shortcuts/ShortcutsPage');
                  return {
                    Component: () => (
                      <RequireFeature feature="shortcuts">
                        <ShortcutsPage />
                      </RequireFeature>
                    ),
                  };
                },
              },
              {
                path: 'alerts',
                lazy: async () => {
                  const { AlertsPage } = await import('@/features/alerts/AlertsPage');
                  return {
                    Component: () => (
                      <RequireFeature feature="alerts">
                        <AlertsPage />
                      </RequireFeature>
                    ),
                  };
                },
              },
              {
                path: 'approvals',
                lazy: async () => {
                  const { ApprovalsPage } = await import('@/features/approvals/ApprovalsPage');
                  return {
                    Component: () => (
                      <RequireFeature feature="approvals">
                        <ApprovalsPage />
                      </RequireFeature>
                    ),
                  };
                },
              },
              {
                path: 'sources',
                lazy: async () => {
                  const { SourcesPage } = await import('@/features/sources/SourcesPage');
                  return {
                    Component: () => (
                      <RequireFeature feature="sources">
                        <SourcesPage />
                      </RequireFeature>
                    ),
                  };
                },
              },
              {
                path: 'audit',
                lazy: async () => {
                  const { AuditPage } = await import('@/features/audit/AuditPage');
                  return {
                    Component: () => (
                      <RequireFeature feature="audit">
                        <RequirePermission permission="audit.read">
                          <AuditPage />
                        </RequirePermission>
                      </RequireFeature>
                    ),
                  };
                },
              },
              {
                path: 'settings',
                lazy: async () => ({
                  Component: (await import('@/features/settings/SettingsPage')).SettingsPage,
                }),
              },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
]);
