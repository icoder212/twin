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
import type { ConnectedSource, SourceCategory, SourceProvider, Tone } from '@twindesk/core';

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
