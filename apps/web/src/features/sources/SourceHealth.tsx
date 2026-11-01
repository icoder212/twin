import { BellRing, RotateCw } from 'lucide-react';
import { useState } from 'react';
import { formatTime, type ConnectedSource, type SourceCheck } from '@twindesk/core';
import { useAuth } from '@/features/auth/use-auth';
import { cn } from '@/lib/cn';
import { useLocale } from '@/shared/hooks/use-locale';
import { Switch } from '@/shared/ui/field';
import { useSetAlertOnDisconnect } from './queries';
import { CHECK_META, formatLatency, healthSummary } from './source-meta';

const HOUR = 3_600_000;

/** Fetch history and freshness for one connected source. */
export function SourceHealth({ source }: { source: ConnectedSource }) {
  const locale = useLocale();
  // Fixed when the card mounts, so hour labels stay stable while it is open.
  const [now] = useState(() => Date.now());
  const health = source.health;
  if (!health) return null;
  const { hourly } = health;
  const idleOnly = hourly.length > 0 && hourly.every((h) => h === 'idle');
  const present = (Object.keys(CHECK_META) as SourceCheck[]).filter((k) => hourly.includes(k));
  const summary = healthSummary(hourly);

  return (
    <div className="mt-3 rounded-xl border border-line bg-surface-2/40 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-fg-muted">Last 24 hours</p>
        {!idleOnly ? (
          <p className="text-xs text-fg">
            <span className="font-semibold tabular">{health.successRate24h}%</span>{' '}
            <span className="text-fg-muted">succeeded</span>
          </p>
        ) : null}
      </div>

      <div role="img" aria-label={summary} className="mt-2 flex h-5 gap-[2px]">
        {hourly.map((check, i) => {
          const start = now - (hourly.length - i) * HOUR;
          return (
            <span
              key={i}
              title={`${formatTime(new Date(start), locale)} to ${formatTime(new Date(start + HOUR), locale)}: ${CHECK_META[check].label}`}
              className={cn('min-w-0 flex-1 rounded-[2px]', CHECK_META[check].bar)}
            />
          );
        })}
      </div>
      <div
        aria-hidden
        className="mt-1 flex justify-between font-mono text-[10px] text-fg-subtle tabular"
      >
        <span>{hourly.length >= 24 ? '24h ago' : `${hourly.length}h ago`}</span>
        <span>Now</span>
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1" aria-label="Key">
        {present.map((k) => (
          <li key={k} className="flex items-center gap-1.5 text-[11px] text-fg-muted">
            <span aria-hidden className={cn('size-2 rounded-[2px]', CHECK_META[k].bar)} />
            {CHECK_META[k].label}
          </li>
        ))}
      </ul>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        {health.latencyMs !== undefined ? (
          <div>
            <dt className="text-fg-subtle">Typical delay</dt>
            <dd className="mt-0.5 font-medium text-fg tabular">
              {formatLatency(health.latencyMs, locale)}
            </dd>
          </div>
        ) : null}
        {health.nextSyncAt && !health.retry ? (
          <div>
            <dt className="text-fg-subtle">Next fetch</dt>
            <dd className="mt-0.5 font-medium text-fg tabular">
              {formatTime(health.nextSyncAt, locale)}
            </dd>
          </div>
        ) : null}
        {idleOnly ? (
          <div className="col-span-2">
            <dt className="sr-only">Schedule</dt>
            <dd className="text-fg-muted">{summary}</dd>
          </div>
        ) : null}
      </dl>

      {health.retry ? (
        <p
          className="mt-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-2.5 py-2 text-xs leading-relaxed text-warning"
          aria-live="polite"
        >
          <RotateCw className="mt-px size-3.5 shrink-0" aria-hidden />
          Retrying, attempt {health.retry.attempt} of {health.retry.maxAttempts}, next at{' '}
          {formatTime(health.retry.nextAt, locale)}.
        </p>
      ) : null}
    </div>
  );
}

/** Opt in to a critical notification when the source stops fetching. */
export function DisconnectAlert({ source }: { source: ConnectedSource }) {
  const { can } = useAuth();
  const toggle = useSetAlertOnDisconnect();
  if (source.status === 'not-connected') return null;

  if (!can('sources.manage')) {
    return source.alertOnDisconnect ? (
      <p className="mt-3 flex items-center gap-1.5 text-xs text-fg-muted">
        <BellRing className="size-3.5 text-brand-fg" aria-hidden />
        Disconnect alerts are on
      </p>
    ) : null;
  }

  const id = `disconnect-${source.id}`;
  return (
    <div className="mt-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p id={id} className="text-[13px] font-medium text-fg">
          Alert me if this stops fetching
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-fg-subtle">
          Sends a critical notification through your delivery settings.
        </p>
      </div>
      <Switch
        checked={source.alertOnDisconnect}
        disabled={toggle.isPending && toggle.variables.id === source.id}
        label={`Alert me if ${source.name} stops fetching`}
        onCheckedChange={(enabled) => toggle.mutate({ id: source.id, enabled })}
      />
    </div>
  );
}
