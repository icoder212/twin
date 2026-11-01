import {
  CircleCheck,
  Plug,
  RotateCw,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import type { ConnectedSource, Tone } from '@twindesk/core';
import { useAuth } from '@/features/auth/use-auth';
import { Page, PageHeader } from '@/shared/components/PageHeader';
import { QueryView } from '@/shared/components/QueryView';
import { cn } from '@/lib/cn';
import { toneText } from '@/shared/ui/badge';
import { Card } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/feedback';
import { ConnectSourceDialog } from './ConnectSourceDialog';
import { useSources } from './queries';
import { SourceCard } from './SourceCard';
import { CATEGORIES, healthState } from './source-meta';

const STEPS = [
  {
    title: 'Connect',
    body: 'Add a read-only API key or sign in through the provider, scoped to what your tasks need. Keys sit in a managed vault, never in a prompt.',
  },
  {
    title: 'Fetch',
    body: 'The twin pulls new data on a schedule you set, or the moment a task needs it.',
  },
  {
    title: 'Add to its knowledge',
    body: 'Each record joins its knowledge with its source, time and owner. Data is marked with its age, so nothing stale passes as current.',
  },
  {
    title: 'Use and cite',
    body: 'Answers and tasks draw on your live data alongside your rules and notes, and the inspector shows which record each claim came from.',
  },
];

export function SourcesPage() {
  const sources = useSources();
  const { can } = useAuth();
  const [connecting, setConnecting] = useState<ConnectedSource | null>(null);

  return (
    <Page>
      <PageHeader
        eyebrow="Connected sources"
        title="Plug in your data. It joins the twin’s knowledge."
        description="Configure read-only access and your twin fetches what it needs, keeps it current and cites it, so every answer and task works from your real data, not a paste into a chat."
      />

      <ol className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {STEPS.map((step, i) => (
          <li key={step.title}>
            <Card className="h-full p-4">
              <span className="font-mono text-xs font-semibold text-brand-fg">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h2 className="mt-1.5 text-[13.5px] font-semibold text-fg">{step.title}</h2>
              <p className="mt-1 text-xs leading-relaxed text-fg-muted">{step.body}</p>
            </Card>
          </li>
        ))}
      </ol>

      <QueryView
        query={sources}
        loading={
          <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-56 rounded-2xl" />
            ))}
          </div>
        }
      >
        {(data) => {
          const connected = data.filter(
            (s) => s.status === 'connected' || s.status === 'syncing',
          ).length;
          const byState = (state: ReturnType<typeof healthState>) =>
            data.filter((s) => healthState(s) === state);
          const normal = byState('normal');
          const delayed = byState('delayed');
          const attention = byState('attention');
          const names = (list: ConnectedSource[]) => list.map((s) => s.name).join(', ');
          return (
            <>
              <ul
                className="mt-8 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4"
                aria-label="Source health"
                aria-live="polite"
              >
                <HealthTile
                  icon={Plug}
                  tone="brand"
                  label="Connected"
                  value={connected}
                  hint={`${data.length - connected} more available`}
                />
                <HealthTile
                  icon={CircleCheck}
                  tone="success"
                  label="Fetching normally"
                  value={normal.length}
                  hint="On schedule in the last hour"
                />
                <HealthTile
                  icon={RotateCw}
                  tone="warning"
                  label="Delayed or retrying"
                  value={delayed.length}
                  hint={delayed.length ? names(delayed) : 'Nothing delayed'}
                />
                <HealthTile
                  icon={TriangleAlert}
                  tone="danger"
                  label="Needs attention"
                  value={attention.length}
                  hint={attention.length ? names(attention) : 'Nothing to reconnect'}
                />
              </ul>
              {!can('sources.manage') ? (
                <p className="mt-3 text-xs text-fg-subtle">
                  Your role can view connections. Changing them needs source management access.
                </p>
              ) : null}

              {CATEGORIES.map((category) => {
                const items = data.filter((s) => s.category === category.id);
                if (!items.length) return null;
                return (
                  <section
                    key={category.id}
                    aria-labelledby={`cat-${category.id}`}
                    className="mt-8"
                  >
                    <h2
                      id={`cat-${category.id}`}
                      className="mb-3 font-mono text-[11px] font-medium tracking-[0.16em] text-fg-subtle uppercase"
                    >
                      {category.title}
                    </h2>
                    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {items.map((source) => (
                        <li key={source.id}>
                          <SourceCard source={source} onConnect={setConnecting} />
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </>
          );
        }}
      </QueryView>

      <p className="mt-8 flex items-start gap-2 rounded-xl border border-line bg-surface/60 p-4 text-[13px] leading-relaxed text-fg-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
        Read-only, scoped to what your tasks need, keys in a managed vault, and every fetch logged.
        Licensed feeds stay under your own licence.
      </p>

      <ConnectSourceDialog source={connecting} onClose={() => setConnecting(null)} />
    </Page>
  );
}

function HealthTile({
  icon: Icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  tone: Tone;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <li>
      <Card className="h-full p-3 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[12.5px] font-medium text-fg-muted">{label}</p>
          <Icon
            className={cn('size-4 shrink-0', value ? toneText[tone] : 'text-fg-subtle')}
            aria-hidden
          />
        </div>
        <p className="mt-2 text-[26px] leading-none font-semibold tracking-tight text-fg tabular">
          {value}
        </p>
        <p className="mt-1.5 line-clamp-2 text-xs text-fg-subtle">{hint}</p>
      </Card>
    </li>
  );
}
