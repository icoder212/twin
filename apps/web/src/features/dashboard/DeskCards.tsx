import {
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Clock,
  Inbox,
  ListChecks,
  MessageSquare,
  Newspaper,
  Play,
  Radio,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  formatMoney,
  formatPct,
  formatRelative,
  type ActionItem,
  type DeskOverview,
  type EconomicEvent,
  type FormatLocale,
  type RoutineItem,
  type RuleWatch,
  type Tone,
} from '@twindesk/core';
import { cn } from '@/lib/cn';
import { Badge, StatusDot } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Checkbox } from '@/shared/ui/field';
import { Meter } from '@/shared/ui/feedback';
import { Tooltip } from '@/shared/ui/menu';
import { EquityChart } from './EquityChart';
import { useToggleActionItem } from './queries';
import { usageTone } from './usage-tone';

// ---------------------------------------------------------------------------
// KPI tiles
// ---------------------------------------------------------------------------

export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  children,
  to,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Clock;
  children?: ReactNode;
  to?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12.5px] font-medium text-fg-muted">{label}</p>
        <Icon className="size-4 text-fg-subtle" aria-hidden />
      </div>
      <p className="mt-2 text-[26px] leading-none font-semibold tracking-tight text-fg">{value}</p>
      {hint ? <p className="mt-1.5 text-xs text-fg-subtle">{hint}</p> : null}
      {children ? <div className="mt-3">{children}</div> : null}
    </>
  );
  const className = 'block rounded-2xl border border-line bg-surface p-4 transition-colors';
  return to ? (
    <Link to={to} className={cn(className, 'hover:border-line-strong')}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

// ---------------------------------------------------------------------------
// Rule watch
// ---------------------------------------------------------------------------

export function RuleWatchCard({ watch, locale }: { watch: RuleWatch; locale: FormatLocale }) {
  const dailyTone = usageTone(watch.dailyLossUsedPct, watch.dailyLossLimitPct);
  const ddTone = usageTone(watch.drawdownUsedPct, watch.maxDrawdownPct);
  const tradesTone = usageTone(watch.tradesToday, watch.maxTradesPerSession + 0.0001);
  const change = watch.equity - (watch.equitySeries[0] ?? watch.equity);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-wrap">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-brand-fg" aria-hidden /> Rule watch
          </CardTitle>
          <CardDescription>
            {watch.accountLabel} · rules version {watch.ruleVersion} · checked by the rule engine on
            every tick
          </CardDescription>
        </div>
        <Badge tone={watch.session.inside ? 'success' : 'neutral'}>
          <StatusDot
            tone={watch.session.inside ? 'success' : 'neutral'}
            pulse={watch.session.inside}
            className="size-1.5"
          />
          {watch.session.inside
            ? 'Inside your session'
            : `Session opens in ${watch.session.opensIn ?? 'the morning'}`}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <p className="text-xs text-fg-subtle">Equity</p>
            <p className="text-[30px] leading-tight font-semibold tracking-tight text-fg">
              {formatMoney(watch.equity, locale, watch.currency)}
            </p>
          </div>
          <dl className="flex gap-6 text-right text-xs">
            <div>
              <dt className="text-fg-subtle">Today</dt>
              <dd className="mt-0.5 font-mono font-medium text-fg tabular">
                {change >= 0 ? '+' : '−'}
                {formatMoney(Math.abs(change), locale, watch.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-fg-subtle">Equity floor</dt>
              <dd className="mt-0.5 font-mono font-medium text-fg tabular">
                {formatMoney(watch.equityFloor, locale, watch.currency)}
              </dd>
            </div>
          </dl>
        </div>

        <div className="mt-3">
          <EquityChart series={watch.equitySeries} locale={locale} currency={watch.currency} />
        </div>

        <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-3">
          <LimitMeter
            label="Daily loss used"
            value={watch.dailyLossUsedPct}
            max={watch.dailyLossLimitPct}
            tone={dailyTone}
            display={`${formatPct(watch.dailyLossUsedPct, locale)} of ${formatPct(watch.dailyLossLimitPct, locale, 0)}`}
            hint={`Resets ${watch.resetsAt.replace(' time', '')}`}
            markers={[watch.dailyLossLimitPct * 0.5, watch.dailyLossLimitPct * 0.8]}
            markersHint="Markers show your alerts at half and most of the limit."
          />
          <LimitMeter
            label="Drawdown used"
            value={watch.drawdownUsedPct}
            max={watch.maxDrawdownPct}
            tone={ddTone}
            display={`${formatPct(watch.drawdownUsedPct, locale)} of ${formatPct(watch.maxDrawdownPct, locale, 0)}`}
            hint="From peak, against the floor"
          />
          <LimitMeter
            label="Trades this session"
            value={watch.tradesToday}
            max={watch.maxTradesPerSession}
            tone={tradesTone}
            display={`${watch.tradesToday} of ${watch.maxTradesPerSession}`}
            hint={watch.session.label}
          />
        </div>
      </CardContent>
    </Card>
  );
}

const toneIcon: Partial<Record<Tone, typeof CheckCircle2>> = {
  success: CheckCircle2,
  warning: TriangleAlert,
  danger: TriangleAlert,
};
const toneWord: Partial<Record<Tone, string>> = {
  success: 'Within limit',
  warning: 'Getting close',
  danger: 'Nearly at the limit',
};

function LimitMeter({
  label,
  value,
  max,
  tone,
  display,
  hint,
  markers,
  markersHint,
}: {
  label: string;
  value: number;
  max: number;
  tone: Tone;
  display: string;
  hint: string;
  markers?: number[];
  markersHint?: string;
}) {
  const Icon = toneIcon[tone] ?? CircleDot;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 whitespace-nowrap">
        <p className="truncate text-[12.5px] text-fg-muted">{label}</p>
        <p className="text-[13px] font-semibold text-fg">{display}</p>
      </div>
      <Meter
        value={value}
        max={max}
        label={label}
        valueText={`${display}. ${toneWord[tone] ?? ''}`}
        tone={tone}
        markers={markers}
        className="mt-2"
      />
      <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] whitespace-nowrap text-fg-subtle">
        <Icon
          className={cn(
            'size-3',
            tone === 'success'
              ? 'text-success'
              : tone === 'warning'
                ? 'text-warning'
                : 'text-danger',
          )}
          aria-hidden
        />
        <span>{toneWord[tone]}</span>
        <span aria-hidden>·</span>
        <span className="min-w-0 truncate">{hint}</span>
        {markersHint ? <span className="sr-only">{markersHint}</span> : null}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A day on this desk, handled
// ---------------------------------------------------------------------------

const stateBadge: Record<RoutineItem['state'], { label: string; tone: Tone }> = {
  done: { label: 'Done', tone: 'success' },
  running: { label: 'Running', tone: 'brand' },
  next: { label: 'Next', tone: 'brand' },
  later: { label: 'Later', tone: 'neutral' },
  live: { label: 'Live', tone: 'info' },
};

export function RoutineCard({ routine, deskLabel }: { routine: RoutineItem[]; deskLabel: string }) {
  const navigate = useNavigate();
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="size-4 text-brand-fg" aria-hidden /> A day on this desk,
            handled
          </CardTitle>
          <CardDescription>
            The routine the twin takes on for {deskLabel.toLowerCase()}.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <ol className="relative">
          {routine.map((item, i) => {
            const badge = stateBadge[item.state];
            return (
              <li key={item.id} className="relative flex gap-4 pb-4 last:pb-0">
                {i < routine.length - 1 ? (
                  <span aria-hidden className="absolute top-7 bottom-0 left-[27px] w-px bg-line" />
                ) : null}
                <span
                  className={cn(
                    'relative z-[1] mt-0.5 grid h-6 w-14 shrink-0 place-items-center rounded-md border font-mono text-[11px]',
                    item.state === 'next' || item.state === 'running'
                      ? 'border-brand-fg/40 bg-brand/15 text-brand-fg'
                      : item.state === 'live'
                        ? 'border-info/30 bg-info/10 text-info'
                        : 'border-line bg-surface-2 text-fg-muted',
                  )}
                >
                  {item.slot}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p
                      className={cn(
                        'text-[13.5px] font-semibold',
                        item.state === 'done' ? 'text-fg-muted' : 'text-fg',
                      )}
                    >
                      {item.title}
                    </p>
                    <Badge tone={badge.tone}>
                      {item.state === 'done' ? (
                        <CheckCircle2 aria-hidden />
                      ) : item.state === 'live' ? (
                        <Radio aria-hidden />
                      ) : null}
                      {badge.label}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-fg-subtle">
                    {item.description}
                  </p>
                </div>
                {item.shortcut ? (
                  <Tooltip content={`Run ${item.shortcut} in the twin`}>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="shrink-0 font-mono text-xs"
                      onClick={() =>
                        void navigate('/twin', { state: { prompt: item.shortcut, autoSend: true } })
                      }
                    >
                      <Play aria-hidden />
                      {item.shortcut.split(' ')[0]}
                    </Button>
                  </Tooltip>
                ) : null}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Action items
// ---------------------------------------------------------------------------

const kindIcon: Record<ActionItem['kind'], typeof Inbox> = {
  'follow-up': MessageSquare,
  reminder: Clock,
  approval: Inbox,
  review: ListChecks,
};

export function ActionItemsCard({ items }: { items: ActionItem[] }) {
  const toggle = useToggleActionItem();
  const open = items.filter((i) => !i.done).length;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <ListChecks className="size-4 text-brand-fg" aria-hidden /> Today’s action items
          </CardTitle>
          <CardDescription>
            {open} open · what you said you would do, follow-ups and anything waiting for you.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-3">
        <ul className="flex flex-col">
          {items.map((item) => {
            const Icon = kindIcon[item.kind];
            const id = `action-${item.id}`;
            return (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-surface-2/60"
              >
                <Checkbox
                  id={id}
                  checked={item.done}
                  onChange={(e) => toggle.mutate({ id: item.id, done: e.target.checked })}
                  className="size-[18px]"
                />
                <label
                  htmlFor={id}
                  className={cn(
                    'min-w-0 flex-1 cursor-pointer text-[13.5px]',
                    item.done ? 'text-fg-subtle line-through' : 'text-fg',
                  )}
                >
                  {item.title}
                </label>
                {item.kind === 'approval' && !item.done ? (
                  <Link
                    to="/approvals"
                    className="shrink-0 text-xs font-medium text-brand-fg hover:underline"
                  >
                    Review
                  </Link>
                ) : null}
                <span className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-fg-subtle">
                  <Icon className="size-3.5" aria-hidden />
                  {item.due}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Economic events
// ---------------------------------------------------------------------------

const impactTone: Record<EconomicEvent['impact'], Tone> = {
  high: 'danger',
  medium: 'warning',
  low: 'neutral',
};

function minutesOf(time: string) {
  const [h = 0, m = 0] = time.split(':').map(Number);
  return h * 60 + m;
}

export function EventsCard({
  events,
  nowMinutes,
}: {
  events: EconomicEvent[];
  nowMinutes: number;
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="size-4 text-brand-fg" aria-hidden /> Today’s releases
          </CardTitle>
          <CardDescription>
            Matched to your watchlist, in your calendar with a 10-minute reminder.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-2">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-y border-line text-[11px] tracking-[0.08em] text-fg-subtle uppercase">
              <th scope="col" className="py-2 pl-5 font-medium">
                Time
              </th>
              <th scope="col" className="py-2 font-medium">
                Release
              </th>
              <th scope="col" className="hidden py-2 pl-3 text-right font-medium sm:table-cell">
                Previous
              </th>
              <th scope="col" className="py-2 pr-5 pl-4 text-right font-medium">
                Consensus
              </th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => {
              const passed = minutesOf(e.time) < nowMinutes;
              return (
                <tr
                  key={e.id}
                  className={cn('border-b border-line last:border-0', passed && 'opacity-55')}
                >
                  <td className="py-2.5 pl-5 font-mono text-[12px] text-fg tabular">{e.time}</td>
                  <td className="py-2.5 pr-2">
                    <span className="flex items-center gap-2">
                      <Badge tone="neutral" className="font-mono">
                        {e.currency}
                      </Badge>
                      <span className="min-w-0 text-fg">{e.title}</span>
                      <span className="sr-only">{e.impact} impact</span>
                      <Tooltip
                        content={`${e.impact === 'high' ? 'High' : e.impact === 'medium' ? 'Medium' : 'Low'} impact`}
                      >
                        <span aria-hidden className="flex shrink-0 gap-0.5">
                          {[0, 1, 2].map((n) => (
                            <span
                              key={n}
                              className={cn(
                                'h-2.5 w-1 rounded-full',
                                n < (e.impact === 'high' ? 3 : e.impact === 'medium' ? 2 : 1)
                                  ? impactTone[e.impact] === 'danger'
                                    ? 'bg-danger'
                                    : 'bg-warning'
                                  : 'bg-surface-3',
                              )}
                            />
                          ))}
                        </span>
                      </Tooltip>
                    </span>
                  </td>
                  <td className="hidden py-2.5 text-right font-mono text-[12px] text-fg-muted tabular sm:table-cell">
                    {e.previous}
                  </td>
                  <td className="py-2.5 pr-5 text-right font-mono text-[12px] text-fg tabular">
                    {e.consensus}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// News brief
// ---------------------------------------------------------------------------

export function NewsCard({ news, locale }: { news: DeskOverview['news']; locale: FormatLocale }) {
  const navigate = useNavigate();
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Newspaper className="size-4 text-brand-fg" aria-hidden /> News brief
          </CardTitle>
          <CardDescription>
            Headlines on the instruments you follow. Sample feed for the demo.
          </CardDescription>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="font-mono text-xs"
          onClick={() =>
            void navigate('/twin', { state: { prompt: '/brief EURUSD', autoSend: true } })
          }
        >
          /brief
        </Button>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y divide-line">
          {news.map((n) => (
            <li key={n.id} className="py-2.5 first:pt-0 last:pb-0">
              <p className="text-[13.5px] leading-snug text-fg">{n.headline}</p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-fg-subtle">
                <span>{n.source}</span>
                <span aria-hidden>·</span>
                <span>{formatRelative(n.at, locale)}</span>
                {n.instruments.map((i) => (
                  <span key={i} className="rounded border border-line px-1 font-mono text-[10.5px]">
                    {i}
                  </span>
                ))}
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
