import {
  Activity,
  CalendarClock,
  CalendarDays,
  ChartCandlestick,
  ChartLine,
  Database,
  FileText,
  Headset,
  Landmark,
  Mail,
  Newspaper,
  NotebookPen,
  Scale,
  type LucideIcon,
} from 'lucide-react';
import {
  formatDateTime,
  formatNumber,
  formatTime,
  type ConnectedSource,
  type FormatLocale,
  type SourceCategory,
  type SourceCheck,
  type SourceProvider,
  type Tone,
} from '@twindesk/core';

export const CATEGORIES: ReadonlyArray<{ id: SourceCategory; title: string }> = [
  { id: 'platform', title: 'Trading platforms' },
  { id: 'market-data', title: 'Market data and events' },
  { id: 'your-day', title: 'Your day' },
  { id: 'firm-systems', title: 'Your firm’s systems' },
];

export const PROVIDER_ICONS: Record<SourceProvider, LucideIcon> = {
  mt5: ChartCandlestick,
  ctrader: ChartCandlestick,
  dxtrade: ChartCandlestick,
  tradingview: ChartLine,
  'broker-api': Landmark,
  'econ-calendar': CalendarClock,
  'news-feed': Newspaper,
  'price-feed': Activity,
  'google-workspace': CalendarDays,
  'microsoft-365': Mail,
  journal: NotebookPen,
  documents: FileText,
  'rule-engine': Scale,
  crm: Headset,
  warehouse: Database,
};

/** Scopes requested on first connection, shown before the user signs in with the provider. */
export const REQUESTED_SCOPES: Partial<Record<SourceProvider, string[]>> = {
  ctrader: ['Accounts (read)', 'Trading history (read)'],
  'google-workspace': [
    'Calendar events (your calendar)',
    'Gmail drafts (sent only after approval)',
    'Sheets (selected files)',
  ],
  'microsoft-365': ['Calendar events (your calendar)', 'Mail drafts (sent only after approval)'],
  journal: ['Journal entries'],
  crm: ['Tickets (read)', 'Reply drafts (sent only after approval)'],
};

export const AUTH_LABELS: Record<ConnectedSource['authMethod'], string> = {
  'api-key': 'Read-only API key',
  oauth: 'Provider sign-in',
  'file-upload': 'File upload',
};

export const ACCESS_META: Record<
  ConnectedSource['access'],
  { label: string; tone: Tone; explain: string }
> = {
  'read-only': {
    label: 'Read-only',
    tone: 'success',
    explain:
      'The twin can read this source but cannot change anything in it, place orders or move money.',
  },
  'scoped-write': {
    label: 'Scoped write',
    tone: 'info',
    explain:
      'The twin can write only where you allowed, such as your own calendar or journal. Anything to another person waits for your approval.',
  },
};

export const STATUS_META: Record<ConnectedSource['status'], { label: string; tone: Tone }> = {
  connected: { label: 'Connected', tone: 'success' },
  syncing: { label: 'Fetching', tone: 'info' },
  error: { label: 'Needs attention', tone: 'danger' },
  'not-connected': { label: 'Not connected', tone: 'neutral' },
};

export function isStale(source: ConnectedSource, now: number = Date.now()): boolean {
  if (source.status !== 'connected' || !source.lastSyncAt) return false;
  return now - new Date(source.lastSyncAt).getTime() > source.staleAfterHours * 3_600_000;
}

/** Hourly fetch results. Colour always comes with this label, in the legend and the summary. */
export const CHECK_META: Record<SourceCheck, { label: string; tone: Tone; bar: string }> = {
  ok: { label: 'Fetched', tone: 'success', bar: 'bg-success' },
  slow: { label: 'Slow', tone: 'warning', bar: 'bg-warning' },
  failed: { label: 'Failed', tone: 'danger', bar: 'bg-danger' },
  idle: { label: 'Nothing scheduled', tone: 'neutral', bar: 'bg-fg-subtle/40' },
};

export type HealthState = 'normal' | 'delayed' | 'attention' | 'off';

/** Where a source stands right now, for the summary tiles and the card. */
export function healthState(source: ConnectedSource, now: number = Date.now()): HealthState {
  if (source.status === 'error') return 'attention';
  if (source.status === 'not-connected') return 'off';
  const hourly = source.health?.hourly ?? [];
  const last = hourly[hourly.length - 1];
  if (source.health?.retry || last === 'slow' || last === 'failed' || isStale(source, now)) {
    return 'delayed';
  }
  return 'normal';
}

/** One sentence that says what the 24-hour bar shows, for screen readers and the card. */
export function healthSummary(hourly: SourceCheck[]): string {
  if (hourly.length === 0) return 'No checks yet.';
  if (hourly.every((h) => h === 'idle')) {
    return 'Fetched when something changes, so there were no scheduled checks in the last 24 hours.';
  }
  const count = (kind: SourceCheck) => hourly.filter((h) => h === kind).length;
  const scheduled = hourly.length - count('idle');
  const succeeded = count('ok') + count('slow');
  const parts = [`${succeeded} of ${scheduled} hourly checks succeeded`];
  if (count('slow')) parts.push(`${count('slow')} slow`);
  if (count('failed')) parts.push(`${count('failed')} failed`);
  return `${parts.join(', ')}.`;
}

export function formatLatency(ms: number, loc: FormatLocale): string {
  return ms < 1000 ? `${formatNumber(ms, loc)} ms` : `${formatNumber(ms / 1000, loc, 1)} s`;
}

/** "10:02" for data from the last day, otherwise the date and time. */
export function formatAsOf(iso: string, loc: FormatLocale, now: number = Date.now()): string {
  return now - new Date(iso).getTime() < 20 * 3_600_000
    ? formatTime(iso, loc)
    : formatDateTime(iso, loc);
}
