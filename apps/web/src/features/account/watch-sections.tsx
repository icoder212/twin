import { BellRing, ExternalLink, Newspaper } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  CENTRAL_BANK_INFO,
  CENTRAL_BANKS,
  formatShortDate,
  formatTime,
  NEWS_SOURCE_LABELS,
  REMIND_MINUTE_CHOICES,
  SUMMARY_TIME_CHOICES,
  safeUrl,
  tickerSchema,
  US_RELEASE_INFO,
  US_RELEASES,
  type CentralBank,
  type EconomicRelease,
  type EconomicReleaseStatus,
  type EconomicState,
  type EconomicWatch,
  type EconomicWatchUpdate,
  type FormatLocale,
  type NewsAlert,
  type NewsState,
  type NewsWatch,
  type NewsWatchUpdate,
  type Tone,
  type UsRelease,
} from '@twindesk/core';
import { useLocale } from '@/shared/hooks/use-locale';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Checkbox, Field, Input, Select, Switch } from '@/shared/ui/field';
import { listChannels, listWords } from './watch-text';

/**
 * The parts of the instructions card: the settings for each kind of alert, as Claude proposed
 * them or as the owner chooses them, and what each watch has found so far.
 */

const STATUS: Record<EconomicReleaseStatus, { label: string; tone: Tone }> = {
  upcoming: { label: 'Upcoming', tone: 'neutral' },
  waiting: { label: 'Waiting for figures', tone: 'info' },
  published: { label: 'Figures sent', tone: 'success' },
  missed: { label: 'Figures not found', tone: 'warning' },
  past: { label: 'Done', tone: 'neutral' },
};

function reminderLabel(minutes: number): string {
  if (minutes === 0) return 'No reminder';
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? '' : 's'} before`;
  return `${minutes} minutes before`;
}

function SectionHeading({
  id,
  icon: Icon,
  children,
  actions,
}: {
  id: string;
  icon: typeof BellRing;
  children: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 id={id} className="flex items-center gap-2 text-sm font-semibold text-fg">
        <Icon className="size-4 text-brand-fg" aria-hidden /> {children}
      </h3>
      {actions ? <div className="flex gap-1">{actions}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// US economic releases
// ---------------------------------------------------------------------------

export function ReleasesFields({
  value,
  onChange,
}: {
  value: EconomicWatchUpdate;
  onChange: (next: EconomicWatchUpdate) => void;
}) {
  const { watch, channels } = value;
  const set = (patch: Partial<EconomicWatch>) =>
    onChange({ ...value, watch: { ...watch, ...patch } });
  const toggle = (event: UsRelease, on: boolean) =>
    set({ events: US_RELEASES.filter((e) => (e === event ? on : watch.events.includes(e))) });
  const choices: readonly number[] = REMIND_MINUTE_CHOICES;
  const minutes = choices.includes(watch.remindMinutes)
    ? choices
    : [...choices, watch.remindMinutes].sort((a, b) => a - b);
  const times: readonly string[] = SUMMARY_TIME_CHOICES;
  const summaryTimes =
    !watch.summaryAt || times.includes(watch.summaryAt)
      ? times
      : [...times, watch.summaryAt].sort();

  return (
    <fieldset className="space-y-4">
      <legend className="text-sm font-semibold text-fg">US economic releases</legend>
      <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Releases to watch">
        {US_RELEASES.map((e) => (
          <label key={e} className="flex items-center gap-2 text-sm text-fg">
            <Checkbox
              checked={watch.events.includes(e)}
              onChange={(event) => toggle(e, event.target.checked)}
            />
            <span>{US_RELEASE_INFO[e].label}</span>
            {US_RELEASE_INFO[e].major ? <Badge>Major</Badge> : null}
          </label>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Summary of the next day" hint="The releases due tomorrow, sent once a day">
          {(props) => (
            <Select
              {...props}
              value={watch.summaryAt ?? ''}
              onChange={(e) => {
                const { summaryAt: _old, ...rest } = watch;
                onChange({
                  ...value,
                  watch: e.target.value ? { ...rest, summaryAt: e.target.value } : rest,
                });
              }}
            >
              <option value="">No summary</option>
              {summaryTimes.map((t) => (
                <option key={t} value={t}>
                  At {t}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Reminder">
          {(props) => (
            <Select
              {...props}
              value={watch.remindMinutes}
              onChange={(e) => set({ remindMinutes: Number(e.target.value) })}
            >
              {minutes.map((m) => (
                <option key={m} value={m}>
                  {reminderLabel(m)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="flex items-center justify-between gap-3 sm:col-span-2">
          <span className="text-sm text-fg">The published figures afterwards</span>
          <Switch
            checked={watch.results}
            onCheckedChange={(results) => set({ results })}
            label="Send the published figures afterwards"
          />
        </div>
      </div>
      {channels ? (
        <p className="text-[13px] text-fg-muted">
          Economic release alerts will go to {listChannels(['in-app', ...channels])}.
        </p>
      ) : null}
    </fieldset>
  );
}

export function Watching({
  state,
  watch,
  onChange,
  onStop,
  stopping,
}: {
  state: EconomicState;
  watch: EconomicWatch;
  onChange: () => void;
  onStop: () => void;
  stopping: boolean;
}) {
  const locale = useLocale();
  const needsFred = !state.fred && watch.events.some((e) => e !== 'fomc');
  const reminder =
    watch.remindMinutes > 0 ? `A reminder ${reminderLabel(watch.remindMinutes)}` : 'No reminder';
  const figures = watch.results ? 'the published figures afterwards' : 'no figures afterwards';
  const summary = watch.summaryAt
    ? `A summary of the next day's releases at ${watch.summaryAt}. `
    : '';

  return (
    <section aria-labelledby="releases-title" className="space-y-3">
      <SectionHeading
        id="releases-title"
        icon={BellRing}
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={onChange}>
              Change
            </Button>
            <Button size="sm" variant="ghost" loading={stopping} onClick={onStop}>
              Stop
            </Button>
          </>
        }
      >
        US economic releases
      </SectionHeading>
      <p className="text-[13px] leading-relaxed text-fg-muted">
        {summary}
        {reminder}, and {figures}. Alerts go to {listChannels(state.channels)}.
      </p>
      <ul className="flex flex-wrap gap-1.5" aria-label="Watched releases">
        {watch.events.map((e) => (
          <li key={e}>
            <Badge tone="brand">{US_RELEASE_INFO[e].label}</Badge>
          </li>
        ))}
      </ul>
      {needsFred ? (
        <p className="text-xs text-warning">
          Release dates come from FRED, which is not set up on the server yet. Until then only the
          Fed decision is scheduled.
        </p>
      ) : null}
      {state.upcoming.length > 0 ? (
        <ReleaseList releases={state.upcoming} locale={locale} />
      ) : (
        <p className="text-[13px] text-fg-subtle">No watched releases in the next 60 days.</p>
      )}
    </section>
  );
}

function ReleaseList({ releases, locale }: { releases: EconomicRelease[]; locale: FormatLocale }) {
  return (
    <ol className="divide-y divide-line rounded-xl border border-line" aria-label="Releases">
      {releases.map((r) => (
        <li key={r.key} className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:gap-3">
          <time dateTime={r.at} className="shrink-0 text-[13px] text-fg-muted tabular-nums sm:w-36">
            {formatShortDate(r.at, locale)}, {formatTime(r.at, locale)}
          </time>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-sm text-fg">
              {US_RELEASE_INFO[r.event].label}
              <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
            </p>
            {r.details ? (
              <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{r.details}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// News
// ---------------------------------------------------------------------------

function parseTickers(text: string): string[] {
  const tickers = text
    .toUpperCase()
    .split(/[\s,;]+/)
    .filter((t) => tickerSchema.safeParse(t).success);
  return [...new Set(tickers)].slice(0, 25);
}

function parseTopics(text: string): string[] {
  const topics = new Map<string, string>();
  for (const raw of text.split(',')) {
    const topic = raw.trim().slice(0, 60);
    if (topic.length >= 2 && !topics.has(topic.toLowerCase()))
      topics.set(topic.toLowerCase(), topic);
  }
  return [...topics.values()].slice(0, 10);
}

export function NewsFields({
  value,
  onChange,
}: {
  value: NewsWatchUpdate;
  onChange: (next: NewsWatchUpdate) => void;
}) {
  const { watch, channels } = value;
  // The boxes keep what was typed; the watch holds what it means.
  const [tickers, setTickers] = useState(watch.tickers.join(', '));
  const [topics, setTopics] = useState(watch.topics.join(', '));
  const set = (patch: Partial<NewsWatch>) => onChange({ ...value, watch: { ...watch, ...patch } });
  const toggle = (bank: CentralBank, on: boolean) =>
    set({
      centralBanks: CENTRAL_BANKS.filter((b) => (b === bank ? on : watch.centralBanks.includes(b))),
    });

  return (
    <fieldset className="space-y-4">
      <legend className="text-sm font-semibold text-fg">News</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Companies" hint="Tickers, separated by commas, such as NVDA, AAPL">
          {(props) => (
            <Input
              {...props}
              value={tickers}
              maxLength={300}
              autoCapitalize="characters"
              onChange={(e) => {
                setTickers(e.target.value);
                set({ tickers: parseTickers(e.target.value) });
              }}
            />
          )}
        </Field>
        <Field label="Topics" hint="Short phrases, separated by commas, such as tariffs, OPEC">
          {(props) => (
            <Input
              {...props}
              value={topics}
              maxLength={600}
              onChange={(e) => {
                setTopics(e.target.value);
                set({ topics: parseTopics(e.target.value) });
              }}
            />
          )}
        </Field>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2" role="group" aria-label="Central banks">
        {CENTRAL_BANKS.map((b) => (
          <label key={b} className="flex items-center gap-2 text-sm text-fg">
            <Checkbox
              checked={watch.centralBanks.includes(b)}
              onChange={(event) => toggle(b, event.target.checked)}
            />
            {CENTRAL_BANK_INFO[b].label} decisions
          </label>
        ))}
      </div>
      {channels ? (
        <p className="text-[13px] text-fg-muted">
          News alerts will go to {listChannels(['in-app', ...channels])}.
        </p>
      ) : null}
    </fieldset>
  );
}

export function Following({
  state,
  watch,
  onChange,
  onStop,
  stopping,
}: {
  state: NewsState;
  watch: NewsWatch;
  onChange: () => void;
  onStop: () => void;
  stopping: boolean;
}) {
  const locale = useLocale();
  const parts = [
    watch.tickers.length > 0 ? `headlines on ${listWords(watch.tickers)}` : '',
    watch.topics.length > 0 ? `anything on ${listWords(watch.topics)}` : '',
    watch.centralBanks.length > 0
      ? `decisions from ${listWords(watch.centralBanks.map((b) => CENTRAL_BANK_INFO[b].short))}`
      : '',
  ].filter(Boolean);
  const wantsHeadlines = watch.tickers.length + watch.topics.length > 0;

  return (
    <section aria-labelledby="news-title" className="space-y-3">
      <SectionHeading
        id="news-title"
        icon={Newspaper}
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={onChange}>
              Change
            </Button>
            <Button size="sm" variant="ghost" loading={stopping} onClick={onStop}>
              Stop
            </Button>
          </>
        }
      >
        News
      </SectionHeading>
      <p className="text-[13px] leading-relaxed text-fg-muted">
        Following {listWords(parts)}. Alerts go to {listChannels(state.channels)}.
      </p>
      {wantsHeadlines && !state.headlines ? (
        <p className="text-xs text-warning">
          Headlines need the Alpaca feed, which is not set up on the server yet. Until then only
          central bank decisions arrive.
        </p>
      ) : null}
      {watch.topics.length > 0 && !state.claude ? (
        <p className="text-xs text-fg-subtle">
          Topics are matched by their words until Claude is set up on the server.
        </p>
      ) : null}
      {state.recent.length > 0 ? (
        <NewsList items={state.recent} locale={locale} />
      ) : (
        <p className="text-[13px] text-fg-subtle">Nothing has matched yet.</p>
      )}
    </section>
  );
}

function NewsList({ items, locale }: { items: NewsAlert[]; locale: FormatLocale }) {
  return (
    <ol className="divide-y divide-line rounded-xl border border-line" aria-label="Latest news">
      {items.map((item) => {
        const link = safeUrl(item.url, { allowRelative: false });
        return (
          <li key={item.id} className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:gap-3">
            <time
              dateTime={item.at}
              className="shrink-0 text-[13px] text-fg-muted tabular-nums sm:w-36"
            >
              {formatShortDate(item.at, locale)}, {formatTime(item.at, locale)}
            </time>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-fg">
                {link ? (
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-start gap-1 hover:underline"
                  >
                    {item.headline}
                    <ExternalLink className="mt-1 size-3 shrink-0 text-fg-subtle" aria-hidden />
                  </a>
                ) : (
                  item.headline
                )}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
                {NEWS_SOURCE_LABELS[item.source]}
                <Badge>{item.match}</Badge>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
