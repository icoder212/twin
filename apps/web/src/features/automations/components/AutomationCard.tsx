import { ArrowRight, CalendarClock, ListChecks, Pause, Play, Workflow } from 'lucide-react';
import { Link } from 'react-router';
import { formatDateTime, formatRelative, type Automation } from '@twindesk/core';
import { useAuth } from '@/features/auth/use-auth';
import { useLocale } from '@/shared/hooks/use-locale';
import { Badge, StatusDot } from '@/shared/ui/badge';
import { Button, buttonVariants } from '@/shared/ui/button';
import { cn } from '@/lib/cn';
import { Card } from '@/shared/ui/card';
import { ToneIcon } from '@/shared/ui/feedback';
import { useRunAutomation, useSetAutomationStatus } from '../queries';
import { AUTOMATION_STATUS, automationPath, KIND_COPY, RUN_STATUS } from '../labels';

export function AutomationCard({ automation }: { automation: Automation }) {
  const locale = useLocale();
  const { can } = useAuth();
  const run = useRunAutomation();
  const setStatus = useSetAutomationStatus();
  const canManage = can(KIND_COPY[automation.kind].permission);
  const status = AUTOMATION_STATUS[automation.status];
  const lastRun = automation.lastRun ? RUN_STATUS[automation.lastRun.status] : null;
  const running = run.isPending && run.variables === automation.id;
  const toggling = setStatus.isPending && setStatus.variables?.id === automation.id;
  const href = automationPath(automation);

  return (
    <Card className="flex flex-col transition-colors hover:border-line-strong">
      <div className="flex items-start gap-3 px-5 pt-5">
        <ToneIcon
          icon={automation.kind === 'task' ? ListChecks : Workflow}
          tone={automation.status === 'active' ? 'brand' : 'neutral'}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold tracking-tight text-fg">
              <Link to={href} className="hover:underline focus-visible:underline">
                {automation.name}
              </Link>
            </h3>
            {automation.shortcut ? (
              <span className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-brand-fg">
                {automation.shortcut}
              </span>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-fg-muted">
            {automation.instruction}
          </p>
        </div>
        <Badge tone={status.tone} className="shrink-0">
          {status.label}
        </Badge>
      </div>

      <dl className="grid flex-1 grid-cols-1 gap-x-4 gap-y-2.5 px-5 py-4 text-[13px] sm:grid-cols-2">
        <div className="flex items-start gap-2">
          <dt className="sr-only">Schedule</dt>
          <CalendarClock className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
          <dd className="text-fg">{automation.schedule.label}</dd>
        </div>
        <div className="flex items-start gap-2">
          <dt className="sr-only">Last run</dt>
          <StatusDot tone={lastRun?.tone ?? 'neutral'} className="mt-1.5" />
          <dd className="text-fg-muted">
            {automation.lastRun && lastRun ? (
              <>
                <span className="text-fg">{lastRun.label}</span> ·{' '}
                {formatRelative(automation.lastRun.startedAt, locale)}
              </>
            ) : (
              'Not run yet'
            )}
          </dd>
        </div>
        {automation.nextRunAt && automation.status === 'active' ? (
          <div className="flex items-start gap-2 sm:col-span-2">
            <dt className="text-fg-subtle">Next run</dt>
            <dd className="font-mono text-xs leading-5 text-fg tabular">
              {formatDateTime(automation.nextRunAt, locale)}
            </dd>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5 sm:col-span-2">
          <dt className="sr-only">Reads from and writes to</dt>
          <dd className="flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
            {automation.sources.map((s) => (
              <span
                key={`s-${s}`}
                className="rounded-md border border-line bg-surface-2/60 px-1.5 py-0.5"
              >
                {s}
              </span>
            ))}
            <ArrowRight className="size-3.5 text-fg-subtle" aria-label="writes to" role="img" />
            {automation.destinations.map((d) => (
              <span
                key={`d-${d}`}
                className="rounded-md border border-line bg-surface-2/60 px-1.5 py-0.5"
              >
                {d}
              </span>
            ))}
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
        {canManage ? (
          <>
            <Button
              size="sm"
              variant="secondary"
              loading={running}
              disabled={automation.status !== 'active'}
              onClick={() => run.mutate(automation.id)}
            >
              {running ? null : <Play aria-hidden />}
              Run now
            </Button>
            <Button
              size="sm"
              variant="ghost"
              loading={toggling}
              onClick={() =>
                setStatus.mutate({
                  id: automation.id,
                  status: automation.status === 'paused' ? 'active' : 'paused',
                })
              }
            >
              {toggling ? null : automation.status === 'paused' ? (
                <Play aria-hidden />
              ) : (
                <Pause aria-hidden />
              )}
              {automation.status === 'paused' ? 'Resume' : 'Pause'}
            </Button>
          </>
        ) : (
          <span className="text-xs text-fg-subtle">View only for your role</span>
        )}
        <Link
          to={href}
          aria-label={`Open ${automation.name}`}
          className={cn(buttonVariants({ size: 'sm', variant: 'ghost' }), 'ml-auto')}
        >
          Open <ArrowRight aria-hidden />
        </Link>
      </div>
    </Card>
  );
}
