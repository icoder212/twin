import {
  ArrowLeft,
  CalendarClock,
  ListChecks,
  OctagonAlert,
  Pause,
  Play,
  ShieldCheck,
  UsersRound,
  Workflow,
} from 'lucide-react';
import { Link, Navigate, useLocation, useParams } from 'react-router';
import { formatDateTime, formatRelative, isApiError, type Automation } from '@twindesk/core';
import { useAuth } from '@/features/auth/use-auth';
import { Page, PageHeader } from '@/shared/components/PageHeader';
import { QueryView } from '@/shared/components/QueryView';
import { useLocale } from '@/shared/hooks/use-locale';
import { Badge } from '@/shared/ui/badge';
import { Button, buttonVariants } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { EmptyState, ErrorState, Skeleton, ToneIcon } from '@/shared/ui/feedback';
import { FlowDiagram } from './components/FlowDiagram';
import { RunHistory } from './components/RunHistory';
import { StepList } from './components/StepList';
import { AUTOMATION_STATUS, automationPath, KIND_COPY, RUN_STATUS, stopReason } from './labels';
import {
  useAutomation,
  useAutomationRuns,
  useRunAutomation,
  useSetAutomationStatus,
} from './queries';

function DetailSkeleton() {
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-3" aria-hidden>
      <div className="space-y-6 lg:col-span-2">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
      <Skeleton className="h-60 rounded-2xl" />
    </div>
  );
}

function Detail({ automation }: { automation: Automation }) {
  const locale = useLocale();
  const { can } = useAuth();
  const runs = useAutomationRuns(automation.id);
  const run = useRunAutomation();
  const setStatus = useSetAutomationStatus();
  const copy = KIND_COPY[automation.kind];
  const status = AUTOMATION_STATUS[automation.status];
  const canManage = can(copy.permission);
  const lastRun = automation.lastRun;
  const stoppedStep =
    lastRun && (lastRun.status === 'stopped' || lastRun.status === 'failed')
      ? lastRun.steps.find((s) => s.status === 'failed')
      : undefined;

  return (
    <>
      <PageHeader
        className="mt-3"
        eyebrow={automation.kind === 'task' ? 'Task' : 'Workflow'}
        title={
          <span className="flex items-center gap-3">
            <ToneIcon
              icon={automation.kind === 'task' ? ListChecks : Workflow}
              tone="brand"
              className="hidden sm:grid"
            />
            {automation.name}
          </span>
        }
        actions={
          canManage ? (
            <>
              <Button
                variant="ghost"
                loading={setStatus.isPending}
                onClick={() =>
                  setStatus.mutate({
                    id: automation.id,
                    status: automation.status === 'paused' ? 'active' : 'paused',
                  })
                }
              >
                {setStatus.isPending ? null : automation.status === 'paused' ? (
                  <Play aria-hidden />
                ) : (
                  <Pause aria-hidden />
                )}
                {automation.status === 'paused' ? 'Resume' : 'Pause'}
              </Button>
              <Button
                variant="primary"
                loading={run.isPending}
                disabled={automation.status !== 'active'}
                onClick={() => run.mutate(automation.id)}
              >
                {run.isPending ? null : <Play aria-hidden />}
                Run now
              </Button>
            </>
          ) : null
        }
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge tone={status.tone}>{status.label}</Badge>
        {automation.shortcut ? (
          <span className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-brand-fg">
            {automation.shortcut}
          </span>
        ) : null}
        <Badge tone="neutral">
          <CalendarClock aria-hidden />
          {automation.schedule.label}
        </Badge>
      </div>

      {stoppedStep ? (
        <div
          role="alert"
          className="mt-6 flex gap-3 rounded-2xl border border-danger/35 bg-danger/10 p-4"
        >
          <OctagonAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-fg">
              The last run stopped instead of guessing
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">
              {stopReason(stoppedStep.message)} Nothing was written. Check the source, then run it
              again.
            </p>
          </div>
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>What you asked for</CardTitle>
            </CardHeader>
            <CardContent>
              <blockquote className="rounded-xl border-l-2 border-brand-fg/60 bg-surface-2/60 px-4 py-3 text-[14px] leading-relaxed text-fg">
                {automation.instruction}
              </blockquote>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>The plan</CardTitle>
                <CardDescription>
                  {automation.steps.length} steps, {automation.sources.length}{' '}
                  {automation.sources.length === 1 ? 'source' : 'sources'},{' '}
                  {automation.destinations.length}{' '}
                  {automation.destinations.length === 1 ? 'destination' : 'destinations'}. Writes
                  only to destinations you allowed.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <FlowDiagram sources={automation.sources} destinations={automation.destinations} />
              <StepList steps={automation.steps} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Run history</CardTitle>
                <CardDescription>
                  Every run is logged step by step. Open a run to see what each step did.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <QueryView
                query={runs}
                loading={
                  <div className="space-y-2" aria-hidden>
                    <Skeleton className="h-12" />
                    <Skeleton className="h-12" />
                    <Skeleton className="h-12" />
                  </div>
                }
              >
                {(items) => <RunHistory runs={items} automation={automation} />}
              </QueryView>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6" aria-label="Schedule and controls">
          <Card>
            <CardHeader>
              <CardTitle>Schedule</CardTitle>
              <CalendarClock className="size-4 text-fg-subtle" aria-hidden />
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-[13px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-subtle">Runs</dt>
                  <dd className="text-right text-fg">{automation.schedule.label}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-subtle">Next run</dt>
                  <dd className="text-right font-mono text-xs text-fg tabular">
                    {automation.nextRunAt && automation.status === 'active'
                      ? formatDateTime(automation.nextRunAt, locale)
                      : '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-subtle">Last run</dt>
                  <dd className="text-right text-fg">
                    {lastRun ? (
                      <>
                        {RUN_STATUS[lastRun.status].label}
                        <span className="block text-xs text-fg-subtle">
                          {formatRelative(lastRun.startedAt, locale)}
                        </span>
                      </>
                    ) : (
                      'Not run yet'
                    )}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-subtle">Created</dt>
                  <dd className="text-right font-mono text-xs text-fg tabular">
                    {formatDateTime(automation.createdAt, locale)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Who it goes to</CardTitle>
              <UsersRound className="size-4 text-fg-subtle" aria-hidden />
            </CardHeader>
            <CardContent>
              {automation.recipients.length ? (
                <ul className="space-y-1.5 text-[13px] text-fg">
                  {automation.recipients.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-fg">Only you.</p>
              )}
              <p className="mt-2 text-xs leading-relaxed text-fg-subtle">
                Anything going to another person waits in Approvals, with the recipients shown
                before it is sent.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Controls on this {copy.singular}</CardTitle>
              <ShieldCheck className="size-4 text-success" aria-hidden />
            </CardHeader>
            <CardContent>
              <ul className="space-y-2.5 text-[13px] leading-relaxed text-fg-muted">
                <li>Reads its sources read-only, with the narrowest access they offer.</li>
                <li>
                  Writes only to the destinations above, never to orders, money or trading accounts.
                </li>
                <li>Stops and tells you if a step fails or the data looks wrong.</li>
                <li>Every run and every step is in the audit log.</li>
              </ul>
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}

export function AutomationDetailPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const query = useAutomation(id);
  const pathKind = location.pathname.startsWith('/workflows') ? 'workflow' : 'task';
  const back = KIND_COPY[query.data?.kind ?? pathKind];

  // A task opened under /workflows (or the reverse) is redirected to its own section.
  if (query.data && query.data.kind !== pathKind)
    return <Navigate to={automationPath(query.data)} replace />;

  return (
    <Page>
      <Link
        to={back.path}
        className="inline-flex min-h-9 items-center gap-1.5 text-[13px] text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {back.plural}
      </Link>
      {query.isError && isApiError(query.error) && query.error.code === 'not-found' ? (
        <Card className="mt-6">
          <EmptyState
            icon={pathKind === 'task' ? ListChecks : Workflow}
            title={`We could not find that ${back.singular}`}
            description="It may have been removed, or it belongs to someone else’s desk."
            action={
              <Link to={back.path} className={buttonVariants({ size: 'sm' })}>
                Back to {back.plural.toLowerCase()}
              </Link>
            }
          />
        </Card>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <QueryView query={query} loading={<DetailSkeleton />}>
          {(automation) => <Detail automation={automation} />}
        </QueryView>
      )}
    </Page>
  );
}
