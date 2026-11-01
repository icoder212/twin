/** Locale-aware formatting shared by every client so figures read the same on web and mobile. */

export interface FormatLocale {
  language: string;
  timezone: string;
  currency: string;
}

const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat | Intl.RelativeTimeFormat>();

function memo<T extends Intl.NumberFormat | Intl.DateTimeFormat | Intl.RelativeTimeFormat>(
  key: string,
  make: () => T,
): T {
  let value = cache.get(key) as T | undefined;
  if (!value) {
    value = make();
    cache.set(key, value);
  }
  return value;
}

export function formatMoney(value: number, loc: FormatLocale, currency = loc.currency): string {
  return memo(
    `m:${loc.language}:${currency}`,
    () =>
      new Intl.NumberFormat(loc.language, {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
      }),
  ).format(value);
}

export function formatNumber(value: number, loc: FormatLocale, digits = 0): string {
  return memo(
    `n:${loc.language}:${digits}`,
    () =>
      new Intl.NumberFormat(loc.language, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }),
  ).format(value);
}

export function formatPct(value: number, loc: FormatLocale, digits = 1): string {
  return `${formatNumber(value, loc, digits)}%`;
}

export function formatTime(iso: string | Date, loc: FormatLocale): string {
  return memo(
    `t:${loc.language}:${loc.timezone}`,
    () =>
      new Intl.DateTimeFormat(loc.language, {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: loc.timezone,
      }),
  ).format(new Date(iso));
}

export function formatDateTime(iso: string | Date, loc: FormatLocale): string {
  return memo(
    `dt:${loc.language}:${loc.timezone}`,
    () =>
      new Intl.DateTimeFormat(loc.language, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: loc.timezone,
      }),
  ).format(new Date(iso));
}

export function formatLongDate(iso: string | Date, loc: FormatLocale): string {
  return memo(
    `ld:${loc.language}:${loc.timezone}`,
    () =>
      new Intl.DateTimeFormat(loc.language, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: loc.timezone,
      }),
  ).format(new Date(iso));
}

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

export function formatRelative(
  iso: string | Date,
  loc: FormatLocale,
  now: number = Date.now(),
): string {
  const diff = new Date(iso).getTime() - now;
  const rtf = memo(
    `r:${loc.language}`,
    () => new Intl.RelativeTimeFormat(loc.language, { numeric: 'auto' }),
  );
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return 'just now';
}

/** Hour of day (0-23) in the given timezone. */
export function hourIn(timezone: string, at: Date = new Date()): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    hour12: false,
    timeZone: timezone,
  }).format(at);
  return Number(hour) % 24;
}
