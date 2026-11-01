import { BellOff, BellRing, CircleAlert, Info, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { formatRelative, safeUrl, type Alert, type AlertKind, type Severity } from '@twindesk/core';
import { Can } from '@/features/auth/guards';
import { cn } from '@/lib/cn';
import { Page, PageHeader } from '@/shared/components/PageHeader';
import { QueryView } from '@/shared/components/QueryView';
import { useLocale } from '@/shared/hooks/use-locale';
import { Badge, StatusDot } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { ConfirmDialog } from '@/shared/ui/dialog';
import { EmptyState, Skeleton, ToneIcon } from '@/shared/ui/feedback';
import { Switch } from '@/shared/ui/field';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/menu';
import { ALERT_KINDS, CHANNEL_LABELS, KIND_META, STATUS_META } from './alert-meta';
import { NewAlertDialog } from './NewAlertDialog';
import {
  useAlerts,
  useMarkNotificationsRead,
  useNotifications,
  useRemoveAlert,
  useSetAlertStatus,
} from './queries';

type Filter = 'all' | AlertKind;

export function AlertsPage() {
  const alerts = useAlerts();
  const [creating, setCreating] = useState<AlertKind | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  return (
    <Page>
      <PageHeader
        eyebrow="Alerts"
        title="Alerts it watches"
        description="Prices at the levels you set, how much of your daily loss limit is used, releases about to publish, and trades outside your own session rule. Alerts describe what happened; the decision stays with you."
        actions={
          <Can permission="alerts.manage">
            <Button variant="primary" onClick={() => setCreating('price')}>
              <Plus aria-hidden /> New alert
            </Button>
          </Can>
        }
      />

      <ul
        className="mt-6 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4"
        aria-label="Kinds of alert"
      >
        {ALERT_KINDS.map((k) => {
          const active =
            alerts.data?.filter((a) => a.kind === k.kind && a.status !== 'paused').length ?? 0;
          return (
            <li key={k.kind}>
              <Card className="flex h-full flex-col gap-2 p-3 sm:gap-3 sm:p-4">
                <div className="flex items-start justify-between gap-2">
                  <ToneIcon icon={k.icon} />
                  {alerts.isPending ? (
                    <Skeleton className="h-5 w-16" />
                  ) : (
                    <Badge tone={active ? 'success' : 'neutral'}>
                      {active ? `${active} watching` : 'None set'}
                    </Badge>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[13px] leading-snug font-semibold text-fg sm:text-[13.5px]">
                    <span className="sm:hidden">{k.short}</span>
                    <span className="hidden sm:inline">{k.label}</span>
                  </h2>
                  <p className="mt-1 hidden text-xs leading-relaxed text-fg-muted sm:block">
                    {k.description}
                  </p>
                </div>
                <Can permission="alerts.manage">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="-ml-2 hidden self-start sm:inline-flex"
                    onClick={() => setCreating(k.kind)}
                  >
                    <Plus aria-hidden /> Add
                  </Button>
                </Can>
              </Card>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section aria-labelledby="your-alerts" className="min-w-0 lg:col-span-2">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 id="your-alerts" className="text-base font-semibold tracking-tight text-fg">
                Your alerts
              </h2>
              <TabsList aria-label="Filter alerts by kind">
                <TabsTrigger value="all">All</TabsTrigger>
                {ALERT_KINDS.map((k) => (
                  <TabsTrigger key={k.kind} value={k.kind}>
                    {k.short}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            <QueryView
              query={alerts}
              loading={
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-24 w-full rounded-2xl" />
                  ))}
                </div>
              }
            >
              {(data) => (
                <TabsContent value={filter} forceMount>
                  <AlertList
                    alerts={filter === 'all' ? data : data.filter((a) => a.kind === filter)}
                    onCreate={() => setCreating(filter === 'all' ? 'price' : filter)}
                  />
                </TabsContent>
              )}
            </QueryView>
          </Tabs>
        </section>

        <NotificationsPanel />
      </div>

      <NewAlertDialog
        open={creating !== null}
        onOpenChange={(o) => !o && setCreating(null)}
        initialKind={creating ?? 'price'}
      />
    </Page>
  );
}

function AlertList({ alerts, onCreate }: { alerts: Alert[]; onCreate: () => void }) {
  if (alerts.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={BellOff}
          title="No alerts of this kind yet"
          description="Set one and it will watch for you, in the app and by push or email."
          action={
            <Can permission="alerts.manage">
              <Button size="sm" variant="primary" onClick={onCreate}>
                <Plus aria-hidden /> New alert
              </Button>
            </Can>
          }
        />
      </Card>
    );
  }
  return (
    <ul className="space-y-2">
      {alerts.map((alert) => (
        <li key={alert.id}>
          <AlertRow alert={alert} />
        </li>
      ))}
    </ul>
  );
}

function AlertRow({ alert }: { alert: Alert }) {
  const locale = useLocale();
  const setStatus = useSetAlertStatus();
  const remove = useRemoveAlert();
  const [confirming, setConfirming] = useState(false);
  const meta = KIND_META[alert.kind];
  const status = STATUS_META[alert.status];
  const watching = alert.status !== 'paused';

  return (
    <Card
      className={cn(
        'flex flex-col gap-3 p-4 sm:flex-row sm:items-center',
        !watching && 'opacity-75',
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <ToneIcon icon={meta.icon} tone={alert.status === 'triggered' ? 'warning' : 'brand'} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-fg">{alert.name}</p>
            <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
              <StatusDot tone={status.tone} pulse={alert.status === 'triggered'} />
              {status.label}
            </span>
          </div>
          <p className="mt-0.5 text-[13px] text-fg-muted">{alert.condition}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {alert.channels.map((c) => (
              <Badge key={c}>{CHANNEL_LABELS[c]}</Badge>
            ))}
            <span className="text-xs text-fg-subtle">
              {alert.lastTriggeredAt
                ? `Last triggered ${formatRelative(alert.lastTriggeredAt, locale)}`
                : 'Not triggered yet'}
            </span>
          </div>
        </div>
      </div>
      <Can permission="alerts.manage">
        <div className="flex items-center justify-end gap-1 border-t border-line pt-3 sm:border-0 sm:pt-0">
          <span className="mr-1 text-xs text-fg-subtle sm:hidden">
            {watching ? 'Watching' : 'Paused'}
          </span>
          <Switch
            checked={watching}
            disabled={setStatus.isPending}
            label={watching ? `Pause ${alert.name}` : `Resume ${alert.name}`}
            onCheckedChange={(on) =>
              setStatus.mutate({ id: alert.id, status: on ? 'active' : 'paused' })
            }
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remove ${alert.name}`}
            onClick={() => setConfirming(true)}
          >
            <Trash2 />
          </Button>
        </div>
      </Can>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Remove this alert?"
        description={`“${alert.name}” will stop watching straight away. The removal is recorded in the audit log.`}
        confirmLabel="Remove alert"
        loading={remove.isPending}
        onConfirm={() => remove.mutate(alert.id, { onSuccess: () => setConfirming(false) })}
      />
    </Card>
  );
}

const SEVERITY: Record<Severity, { icon: typeof Info; className: string; label: string }> = {
  info: { icon: Info, className: 'text-info', label: 'Information' },
  warning: { icon: TriangleAlert, className: 'text-warning', label: 'Warning' },
  critical: { icon: CircleAlert, className: 'text-danger', label: 'Needs attention' },
};

function NotificationsPanel() {
  const notifications = useNotifications();
  const markRead = useMarkNotificationsRead();
  const locale = useLocale();
  const unread = notifications.data?.filter((n) => !n.read) ?? [];

  return (
    <Card className="h-fit lg:sticky lg:top-24" aria-labelledby="recent-notifications">
      <CardHeader>
        <div>
          <CardTitle id="recent-notifications">Recent notifications</CardTitle>
          <CardDescription aria-live="polite">
            {unread.length ? `${unread.length} unread` : 'All caught up'}
          </CardDescription>
        </div>
        {unread.length ? (
          <Button
            size="sm"
            variant="ghost"
            loading={markRead.isPending}
            onClick={() => markRead.mutate(unread.map((n) => n.id))}
          >
            Mark all read
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="px-2 pb-2">
        <QueryView
          query={notifications}
          loading={
            <div className="space-y-2 px-3 pb-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          }
        >
          {(data) =>
            data.length === 0 ? (
              <EmptyState
                icon={BellRing}
                title="Nothing yet"
                description="When an alert fires, it appears here."
              />
            ) : (
              <ul className="divide-y divide-line">
                {data.map((n) => {
                  const sev = SEVERITY[n.severity];
                  const href = safeUrl(n.href);
                  return (
                    <li
                      key={n.id}
                      className={cn(
                        'flex gap-3 rounded-lg px-3 py-3',
                        !n.read && 'bg-surface-2/50',
                      )}
                    >
                      <sev.icon
                        className={cn('mt-0.5 size-4 shrink-0', sev.className)}
                        aria-label={sev.label}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            'text-[13px]',
                            n.read ? 'text-fg-muted' : 'font-semibold text-fg',
                          )}
                        >
                          {n.title}
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed text-fg-subtle">{n.body}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-3">
                          <span className="font-mono text-[10.5px] text-fg-subtle">
                            {formatRelative(n.at, locale)}
                          </span>
                          {href?.startsWith('/') && href !== '/alerts' ? (
                            <Link
                              to={href}
                              className="text-xs font-medium text-brand-fg hover:underline"
                            >
                              Open
                            </Link>
                          ) : null}
                          {!n.read ? (
                            <button
                              type="button"
                              className="text-xs font-medium text-brand-fg hover:underline"
                              onClick={() => markRead.mutate([n.id])}
                            >
                              Mark read
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )
          }
        </QueryView>
      </CardContent>
    </Card>
  );
}
