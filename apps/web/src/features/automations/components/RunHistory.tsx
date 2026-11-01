import {
  ChevronDown,
  CircleCheck,
  CircleSlash,
  CircleX,
  Hourglass,
  OctagonAlert,
} from 'lucide-react';
import { useId, useState } from 'react';
import { formatDateTime, formatTime, type Automation, type AutomationRun } from '@twindesk/core';
import { cn } from '@/lib/cn';
import { useLocale } from '@/shared/hooks/use-locale';
import { Badge, toneText } from '@/shared/ui/badge';
import { EmptyState } from '@/shared/ui/feedback';
import { RUN_STATUS, RUN_TRIGGER, stopReason } from '../labels';

const STEP_ICON = {
  succeeded: { icon: CircleCheck, tone: 'success' },
  failed: { icon: CircleX, tone: 'danger' },
  skipped: { icon: CircleSlash, tone: 'neutral' },
  waiting: { icon: Hourglass, tone: 'warning' },
} as const;

function duration(run: AutomationRun): string | null {
  if (!run.finishedAt) return null;
  const seconds = Math.max(
    0,
    Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000),
  );
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function RunRow({
  run,
  automation,
  defaultOpen,
}: {
  run: AutomationRun;
  automation: Automation;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const locale = useLocale();
  const panelId = useId();
  const status = RUN_STATUS[run.status];
  const stopped = run.status === 'stopped' || run.status === 'failed';
  const failedStep = run.steps.find((s) => s.status === 'failed');
  const took = duration(run);

  return (
    <li
      className={cn(
        'rounded-xl border bg-surface-2/40',
        stopped ? 'border-danger/35' : 'border-line',
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-12 w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 py-2.5 text-left"
      >
        <Badge tone={status.tone}>{status.label}</Badge>
        <span className="font-mono text-xs text-fg tabular">
          {formatDateTime(run.startedAt, locale)}
        </span>
        <span className="text-xs text-fg-subtle">{RUN_TRIGGER[run.trigger]}</span>
        {took ? <span className="text-xs text-fg-subtle">· {took}</span> : null}
        <ChevronDown
          className={cn('ml-auto size-4 text-fg-subtle transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {open ? (
        <div id={panelId} className="border-t border-line px-3.5 py-3">
          {stopped && failedStep ? (
            <div
              role="note"
              className="mb-3 flex gap-2.5 rounded-lg border border-danger/30 bg-danger/10 p-3"
            >
              <OctagonAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
              <div>
                <p className="text-[13px] font-semibold text-fg">Stopped instead of guessing</p>
                <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">
                  {stopReason(failedStep.message)}
                </p>
              </div>
            </div>
          ) : null}
          <ol className="flex flex-col gap-2.5">
            {run.steps.map((s, i) => {
              const { icon: Icon, tone } = STEP_ICON[s.status];
              const step = automation.steps.find((x) => x.id === s.stepId);
              return (
                <li key={s.stepId} className="flex gap-2.5">
                  <Icon
                    role="img"
                    className={cn('mt-0.5 size-4 shrink-0', toneText[tone])}
                    aria-label={s.status}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-fg">
                      <span className="text-fg-subtle">{i + 1}. </span>
                      {step?.description ?? 'Step'}
                    </p>
                    <p className="mt-0.5 text-xs text-fg-subtle">
                      {s.message} ·{' '}
                      <span className="font-mono tabular">{formatTime(s.at, locale)}</span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}
    </li>
  );
}

/** Every run, newest first, with a step-by-step log behind each one. */
export function RunHistory({
  runs,
  automation,
}: {
  runs: AutomationRun[];
  automation: Automation;
}) {
  if (runs.length === 0) {
    return (
      <EmptyState
        icon={Hourglass}
        title="No runs yet"
        description="Runs appear here, step by step, from the first time it runs."
      />
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {runs.map((run, i) => (
        <RunRow
          key={run.id}
          run={run}
          automation={automation}
          defaultOpen={i === 0 || run.status === 'stopped'}
        />
      ))}
    </ul>
  );
}
