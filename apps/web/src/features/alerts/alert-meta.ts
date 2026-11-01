import { CalendarClock, Clock, Gauge, Target, type LucideIcon } from 'lucide-react';
import type { Alert, AlertKind, Tone, Urgency } from '@twindesk/core';

export const ALERT_KINDS: ReadonlyArray<{
  kind: AlertKind;
  label: string;
  short: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    kind: 'price',
    label: 'A price trades at your level',
    short: 'Price',
    description: 'A notification when an instrument trades at the level you typed.',
    icon: Target,
  },
  {
    kind: 'loss-limit',
    label: 'Half or most of your daily loss limit is used',
    short: 'Loss limit',
    description: 'Told when your daily loss limit reaches the share you choose.',
    icon: Gauge,
  },
  {
    kind: 'release',
    label: 'A release is ten minutes away',
    short: 'Releases',
    description: 'A heads-up before scheduled releases, so none catches you mid-trade.',
    icon: CalendarClock,
  },
  {
    kind: 'session-rule',
    label: 'You trade outside your own session rule',
    short: 'Session rule',
    description: 'Flagged when a trade opens outside the hours you set yourself.',
    icon: Clock,
  },
];

export const KIND_META = Object.fromEntries(ALERT_KINDS.map((k) => [k.kind, k])) as Record<
  AlertKind,
  (typeof ALERT_KINDS)[number]
>;

/** Starting urgency for a new alert. Using most of a limit is critical; everything else is important. */
export function defaultUrgency(kind: AlertKind, thresholdPct?: number): Urgency {
  if (kind === 'loss-limit' && (thresholdPct ?? 0) >= 90) return 'critical';
  return 'important';
}

export const STATUS_META: Record<Alert['status'], { label: string; tone: Tone }> = {
  active: { label: 'Watching', tone: 'success' },
  paused: { label: 'Paused', tone: 'neutral' },
  triggered: { label: 'Triggered', tone: 'warning' },
};
