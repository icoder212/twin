import {
  BookOpen,
  Bot,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  Route,
  ScrollText,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { useEffect, useRef, type ReactNode, type Ref } from 'react';
import {
  DESK_LABELS,
  formatDateTime,
  formatRelative,
  safeUrl,
  SPECIALISTS,
  SPECIALIST_LABELS,
  type Citation,
  type SourceKind,
} from '@twindesk/core';
import { useAuth } from '@/features/auth/use-auth';
import { useTenant } from '@/features/tenant/tenant-context';
import { cn } from '@/lib/cn';
import { useLocale } from '@/shared/hooks/use-locale';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Spinner } from '@/shared/ui/feedback';
import { toast } from '@/shared/ui/toast';
import { useChatStore, type TwinMessage } from './chat-store';

const KIND_LABELS: Record<SourceKind, string> = {
  guide: 'Guide',
  article: 'Article',
  service: 'Service page',
  rule: 'Your rules',
  trade: 'Trades',
  calendar: 'Calendar',
  news: 'News',
  note: 'Note',
  statement: 'Statement',
  account: 'Account',
};

const LIBRARY_KINDS = new Set<SourceKind>(['guide', 'article', 'service']);

/** Every answer opens up here: the route, the passages, the checks and the audit record. */
export function Inspector() {
  const inspected = useChatStore((s) => s.inspected);
  const message = useChatStore((s) =>
    s.messages.find((m): m is TwinMessage => m.role === 'twin' && m.id === s.inspected?.messageId),
  );
  return message ? (
    <AnswerInspector message={message} highlight={inspected?.citation} />
  ) : (
    <DeskOverview />
  );
}

function Section({
  step,
  icon: Icon,
  title,
  meta,
  children,
}: {
  step: string;
  icon: typeof Route;
  title: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <section className="relative border-b border-line px-5 py-4 last:border-0">
      <div className="flex items-center gap-2.5">
        <span className="font-mono text-[10px] text-fg-subtle">{step}</span>
        <Icon className="size-3.5 text-brand-fg" aria-hidden />
        <h3 className="text-[13px] font-semibold text-fg">{title}</h3>
        {meta ? (
          <span className="ml-auto font-mono text-[10.5px] text-fg-subtle">{meta}</span>
        ) : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function AnswerInspector({ message, highlight }: { message: TwinMessage; highlight?: number }) {
  const locale = useLocale();
  const { user } = useAuth();
  const { tenant } = useTenant();
  const answer = message.answer;
  const finalChecks = message.checkRounds.at(-1);
  const blocked = message.checkRounds.slice(0, -1);
  const highlightRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    highlightRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [highlight]);

  return (
    <div>
      <Section step="01" icon={Route} title="Router agent" meta={answer?.models.router}>
        {message.specialist ? (
          <>
            <ul className="flex flex-wrap gap-1.5" aria-label="Specialists">
              {SPECIALISTS.map((s) => (
                <li
                  key={s}
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-[11px]',
                    s === message.specialist
                      ? 'border-brand-fg/50 bg-brand/15 font-semibold text-brand-fg'
                      : 'border-line text-fg-subtle',
                  )}
                  aria-current={s === message.specialist ? 'true' : undefined}
                >
                  {SPECIALIST_LABELS[s]}
                </li>
              ))}
            </ul>
            <p className="mt-2.5 text-[12.5px] leading-relaxed text-fg-muted">
              {message.routeReason}
            </p>
          </>
        ) : (
          <Pending label="Picking a specialist" />
        )}
      </Section>

      <Section
        step="02"
        icon={BookOpen}
        title="Research agent"
        meta={message.library ? `${message.library.matched} / ${message.library.size}` : undefined}
      >
        {message.library ? (
          message.citations.length ? (
            <ol className="space-y-2">
              {message.citations.map((c) => (
                <PassageCard
                  key={c.index}
                  citation={c}
                  active={highlight === c.index}
                  innerRef={highlight === c.index ? highlightRef : undefined}
                />
              ))}
            </ol>
          ) : (
            <p className="text-[12.5px] text-fg-muted">
              No passage in the library covers this, so none is cited and nothing is guessed.
            </p>
          )
        ) : message.stage === 'routing' ? (
          <p className="text-[12.5px] text-fg-subtle">Waiting for the router.</p>
        ) : (
          <Pending label="Searching the knowledge library" />
        )}
      </Section>

      <Section
        step="03"
        icon={Bot}
        title={`${message.specialist ? SPECIALIST_LABELS[message.specialist] : 'Specialist'} agent`}
        meta={answer?.models.specialist}
      >
        <p className="text-[12.5px] leading-relaxed text-fg-muted">
          Drafts the answer from the retrieved passages only, under its own niche brief, and cites
          each one by number.
        </p>
      </Section>

      <Section
        step="04"
        icon={ShieldCheck}
        title="Compliance agent"
        meta={
          finalChecks
            ? `${finalChecks.checks.filter((c) => c.passed).length} of ${finalChecks.checks.length}`
            : undefined
        }
      >
        {blocked.map((round) => (
          <div
            key={round.attempt}
            className="mb-3 rounded-lg border border-danger/30 bg-danger/8 p-3"
          >
            <p className="flex items-center gap-2 text-[12.5px] font-semibold text-fg">
              <XCircle className="size-3.5 text-danger" aria-hidden /> Draft {round.attempt} blocked
              and rewritten
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-fg-muted">
              Failed:{' '}
              {round.checks
                .filter((c) => !c.passed)
                .map((c) => c.label.toLowerCase())
                .join(', ')}
              . The draft was never shown and does not re-enter the conversation.
            </p>
          </div>
        ))}
        {finalChecks ? (
          <ul className="grid gap-1.5">
            {finalChecks.checks.map((check) => (
              <li key={check.id} className="flex items-start gap-2 text-[12.5px]">
                {check.passed ? (
                  <CheckCircle2
                    className="mt-0.5 size-3.5 shrink-0 text-success"
                    aria-label="Passed"
                  />
                ) : (
                  <XCircle className="mt-0.5 size-3.5 shrink-0 text-danger" aria-label="Failed" />
                )}
                <span className={check.passed ? 'text-fg-muted' : 'text-fg'}>
                  {check.label}
                  {check.detail ? (
                    <span className="block text-[11.5px] text-fg-subtle">{check.detail}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Pending label="Running eight advice checks" />
        )}
      </Section>

      <Section step="05" icon={ScrollText} title="Audit record">
        {answer ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12px]">
            <dt className="text-fg-subtle">Answer id</dt>
            <dd className="flex items-center gap-1.5 font-mono text-fg">
              {answer.id}
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-6"
                aria-label="Copy answer id"
                onClick={() =>
                  void navigator.clipboard
                    ?.writeText(answer.id)
                    .then(() => toast.success('Answer id copied'))
                    .catch(() => undefined)
                }
              >
                <Copy className="size-3" />
              </Button>
            </dd>
            <dt className="text-fg-subtle">Logged</dt>
            <dd className="text-fg">{formatDateTime(answer.createdAt, locale)}</dd>
            <dt className="text-fg-subtle">For</dt>
            <dd className="truncate text-fg">
              {user?.name} · {tenant.name}
            </dd>
            <dt className="text-fg-subtle">Library</dt>
            <dd className="font-mono text-fg">{answer.library.version}</dd>
            <dt className="text-fg-subtle">Models</dt>
            <dd className="font-mono text-fg">
              {answer.models.router}, {answer.models.specialist}
            </dd>
            <dt className="text-fg-subtle">Time</dt>
            <dd className="font-mono text-fg">{(answer.latencyMs / 1000).toFixed(1)}s</dd>
          </dl>
        ) : (
          <Pending label="Written when the answer is ready" />
        )}
      </Section>
    </div>
  );
}

function PassageCard({
  citation,
  active,
  innerRef,
}: {
  citation: Citation;
  active: boolean;
  innerRef?: Ref<HTMLLIElement>;
}) {
  const locale = useLocale();
  const url = safeUrl(citation.url);
  return (
    <li
      ref={innerRef}
      className={cn(
        'rounded-lg border p-3 transition-colors',
        active ? 'border-brand-fg/60 bg-brand/10' : 'border-line bg-surface-2/40',
      )}
    >
      <div className="flex items-start gap-2">
        <span className="grid h-[18px] min-w-[18px] place-items-center rounded border border-brand-fg/40 bg-brand/15 px-1 font-mono text-[10.5px] font-semibold text-brand-fg">
          {citation.index}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] leading-snug font-semibold text-fg">{citation.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-fg-subtle">
            <Badge tone="neutral" className="px-1.5 py-0 text-[10px]">
              {KIND_LABELS[citation.kind]}
            </Badge>
            {citation.owner} · updated {formatRelative(citation.updatedAt, locale)}
          </p>
        </div>
      </div>
      <blockquote className="mt-2 border-l-2 border-brand-fg/40 pl-2.5 text-[12px] leading-relaxed text-fg-muted">
        {citation.excerpt}
      </blockquote>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-medium text-brand-fg hover:underline"
        >
          Open the source <ExternalLink className="size-3" aria-hidden />
        </a>
      ) : (
        <p className="mt-2 flex items-center gap-1 text-[11px] text-fg-subtle">
          <FileText className="size-3" aria-hidden />
          {LIBRARY_KINDS.has(citation.kind)
            ? 'Published in the knowledge library'
            : 'Your own record, read-only'}
        </p>
      )}
    </li>
  );
}

function Pending({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-[12.5px] text-fg-subtle">
      <Spinner /> {label}
    </p>
  );
}

/** Shown before any question: how this twin is set up for the user's desk. */
function DeskOverview() {
  const { user } = useAuth();
  const { tenant } = useTenant();
  if (!user) return null;
  const rows: Array<{ title: string; items: string[] }> = [
    {
      title: 'Agents on this desk',
      items: [
        'Router agent · picks one of seven specialists',
        'Research agent · searches your library',
        'Specialist agents · draft from passages only',
        'Compliance agent · eight advice checks on everything',
      ],
    },
    {
      title: 'Connects to, read-only',
      items: [
        'MetaTrader 5',
        'cTrader',
        'TradingView',
        'Broker statements',
        'Economic calendar',
        'News feed',
        'Google or Microsoft calendar',
        'Your journal',
      ],
    },
    {
      title: 'Alerts it watches',
      items: [
        'A price trades at your level',
        'Half or most of your daily loss limit is used',
        'A release is ten minutes away',
        'You trade outside your own session rule',
      ],
    },
  ];
  return (
    <div className="px-5 py-4">
      <p className="text-[12.5px] leading-relaxed text-fg-muted">
        Every answer opens up here with its passages, eight advice checks and audit record. Until
        then, this is how {tenant.productName} is set up for{' '}
        <span className="text-fg">{DESK_LABELS[user.deskType].long}</span>.
      </p>
      {rows.map((row) => (
        <div key={row.title} className="mt-5">
          <h3 className="font-mono text-[10.5px] tracking-[0.14em] text-fg-subtle uppercase">
            {row.title}
          </h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {row.items.map((item) => (
              <li
                key={item}
                className="rounded-full border border-line bg-surface-2/40 px-2.5 py-1 text-[11.5px] text-fg-muted"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
