import { ArrowRight, CircleCheck, Play, Search, SquareSlash, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { formatRelative, type Automation, type Shortcut } from '@twindesk/core';
import { useAutomations } from '@/features/automations/queries';
import { automationPath } from '@/features/automations/labels';
import { useAuth } from '@/features/auth/use-auth';
import { useTenant } from '@/features/tenant/tenant-context';
import { Page, PageHeader } from '@/shared/components/PageHeader';
import { QueryView } from '@/shared/components/QueryView';
import { useLocale } from '@/shared/hooks/use-locale';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { ConfirmDialog } from '@/shared/ui/dialog';
import { EmptyState, Skeleton } from '@/shared/ui/feedback';
import { Input } from '@/shared/ui/field';
import { useRemoveShortcut, useShortcuts } from './queries';

/** Hints such as "EURUSD 1.0900" are real values and can run as-is; "your note" is a placeholder. */
function promptFor(shortcut: Shortcut): { prompt: string; autoSend: boolean } {
  if (!shortcut.argsHint) return { prompt: shortcut.command, autoSend: true };
  if (/^[A-Z0-9. ]+$/.test(shortcut.argsHint))
    return { prompt: `${shortcut.command} ${shortcut.argsHint}`, autoSend: true };
  return { prompt: `${shortcut.command} `, autoSend: false };
}

function TerminalHero() {
  const { tenant } = useTenant();
  const lines = [
    'Read your rules, version 3',
    'Read yesterday’s trades, read-only',
    'Read today’s releases for your watchlist',
  ];
  return (
    <figure className="overflow-hidden rounded-2xl glass-strong">
      <figcaption className="sr-only">
        Example: typing /prep runs the morning session prep task.
      </figcaption>
      <div className="flex items-center gap-1.5 border-b border-line px-4 py-2.5" aria-hidden>
        <span className="size-2.5 rounded-full bg-danger/70" />
        <span className="size-2.5 rounded-full bg-warning/70" />
        <span className="size-2.5 rounded-full bg-success/70" />
        <span className="ml-2 font-mono text-[11px] text-fg-subtle">
          {tenant.productName.toLowerCase().replace(/\s+/g, '-')}
        </span>
      </div>
      <div aria-hidden className="space-y-3 p-5 font-mono text-[13px]">
        <p className="text-fg">
          <span className="text-brand-fg">{'>'}</span> /prep
          <span className="ml-0.5 inline-block animate-caret text-brand-fg">▍</span>
        </p>
        <p className="flex flex-wrap items-center gap-2">
          <Badge tone="success">Running</Badge>
          <span className="text-fg-muted">morning session prep</span>
        </p>
        <ul className="space-y-1.5 text-xs text-fg-subtle">
          {lines.map((line) => (
            <li key={line} className="flex items-center gap-2">
              <CircleCheck className="size-3.5 text-success" />
              {line}
            </li>
          ))}
          <li className="flex items-center gap-2 text-fg-muted">
            <span className="size-3.5 animate-pulse rounded-full border border-brand-fg/60" />
            Write one checklist for the session
          </li>
        </ul>
      </div>
    </figure>
  );
}

function ShortcutCard({
  shortcut,
  automation,
  onRemove,
}: {
  shortcut: Shortcut;
  automation: Automation | undefined;
  onRemove: (s: Shortcut) => void;
}) {
  const locale = useLocale();
  const navigate = useNavigate();
  const { isEnabled } = useTenant();
  const { can } = useAuth();
  const { prompt, autoSend } = promptFor(shortcut);

  return (
    <Card className="flex w-full flex-col p-5 transition-colors hover:border-line-strong">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[15px] font-semibold break-words text-brand-fg">
            {shortcut.command}
            {shortcut.argsHint ? (
              <span className="ml-1.5 font-normal text-fg-subtle">{shortcut.argsHint}</span>
            ) : null}
          </p>
          <h3 className="mt-1 text-[14px] font-semibold text-fg">{shortcut.title}</h3>
        </div>
        <Badge tone={shortcut.builtIn ? 'neutral' : 'brand'} className="shrink-0">
          {shortcut.builtIn ? 'Built in' : 'Yours'}
        </Badge>
      </div>
      <p className="mt-2 flex-1 text-[13px] leading-relaxed text-fg-muted">
        {shortcut.description}
      </p>
      <p className="mt-3 text-xs text-fg-subtle">
        {shortcut.usageCount ? `Used ${shortcut.usageCount} times` : 'Not used yet'}
        {shortcut.lastUsedAt ? ` · last used ${formatRelative(shortcut.lastUsedAt, locale)}` : ''}
      </p>
      {automation ? (
        <Link
          to={automationPath(automation)}
          className="mt-1.5 inline-flex min-h-8 items-center gap-1 self-start text-xs font-medium text-brand-fg hover:underline"
        >
          Runs “{automation.name}” <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      ) : null}
      <div className="mt-4 flex items-center gap-2 border-t border-line pt-3">
        {isEnabled('twin') ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void navigate('/twin', { state: { prompt, autoSend } })}
            aria-label={`Run ${shortcut.command} in the twin`}
          >
            <Play aria-hidden />
            {autoSend ? 'Run' : 'Open in the twin'}
          </Button>
        ) : null}
        {!shortcut.builtIn && can('shortcuts.manage') ? (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-fg-subtle hover:text-danger"
            onClick={() => onRemove(shortcut)}
            aria-label={`Remove ${shortcut.command}`}
          >
            <Trash2 aria-hidden />
            Remove
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

export function ShortcutsPage() {
  const query = useShortcuts();
  const automations = useAutomations();
  const remove = useRemoveShortcut();
  const [search, setSearch] = useState('');
  const [removing, setRemoving] = useState<Shortcut | null>(null);
  const byId = useMemo(
    () => new Map((automations.data ?? []).map((a) => [a.id, a])),
    [automations.data],
  );

  return (
    <Page>
      <PageHeader
        eyebrow="Saved shortcuts"
        title="One word runs the whole job"
        description="Save any task or workflow under a word. Type the word and your twin runs it with everything you set up once: the sources, the steps, the schedule and who it goes to. Add a detail after it, such as an instrument, a level or an account, and it fills that in."
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <TerminalHero />
        <Card className="flex flex-col justify-between gap-4 p-5">
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight text-fg">
              A skill your twin learned from one instruction
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">
              You build your own library of them, and nobody has to write a prompt again. Type{' '}
              <span className="font-mono text-fg">/</span> anywhere in the app, or in the twin, to
              see them.
            </p>
            <ul className="mt-4 flex flex-wrap gap-2 font-mono text-[13px]">
              {['/brief EURUSD', '/alert EURUSD 1.0900', '/payout 10482'].map((example) => (
                <li
                  key={example}
                  className="rounded-lg border border-line bg-surface-2/60 px-2.5 py-1.5 text-fg"
                >
                  {example}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs leading-relaxed text-fg-subtle">
            New shortcuts come from saving a{' '}
            <Link to="/tasks" className="text-brand-fg hover:underline">
              task
            </Link>{' '}
            or a{' '}
            <Link to="/workflows" className="text-brand-fg hover:underline">
              workflow
            </Link>{' '}
            with a shortcut word.
          </p>
        </Card>
      </div>

      <section aria-labelledby="library-heading" className="mt-10">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="library-heading" className="text-lg font-semibold tracking-tight text-fg">
              Your library
            </h2>
            <p className="text-[13px] text-fg-muted">
              Most used first. Every run is logged like any other answer.
            </p>
          </div>
          <div className="relative sm:w-72">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle"
              aria-hidden
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value.slice(0, 60))}
              placeholder="Search shortcuts"
              aria-label="Search shortcuts"
              className="pl-9"
              autoComplete="off"
            />
          </div>
        </div>

        <QueryView
          query={query}
          loading={
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-52 rounded-2xl" />
              ))}
            </div>
          }
        >
          {(items) => {
            const q = search.trim().toLowerCase();
            const shown = q
              ? items.filter((s) =>
                  `${s.command} ${s.title} ${s.description}`.toLowerCase().includes(q),
                )
              : items;
            if (shown.length === 0) {
              return (
                <Card>
                  <EmptyState
                    icon={SquareSlash}
                    title={q ? 'No shortcuts match' : 'No shortcuts yet'}
                    description={
                      q
                        ? 'Try another word.'
                        : 'Save a task or workflow with a shortcut word and it appears here.'
                    }
                  />
                </Card>
              );
            }
            return (
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {shown.map((s) => (
                  <li key={s.id} className="flex">
                    <ShortcutCard
                      shortcut={s}
                      automation={s.automationId ? byId.get(s.automationId) : undefined}
                      onRemove={setRemoving}
                    />
                  </li>
                ))}
              </ul>
            );
          }}
        </QueryView>
      </section>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.command ?? 'this shortcut'}?`}
        description="The task or workflow behind it keeps running on its schedule. Only the shortcut word goes."
        confirmLabel="Remove shortcut"
        loading={remove.isPending}
        onConfirm={() => {
          if (!removing) return;
          remove.mutate(removing.id, { onSettled: () => setRemoving(null) });
        }}
      />
    </Page>
  );
}
