/** How published figures are written in alerts: the agencies' own rounding, plain units. */

export type Format = 'signed-percent' | 'percent' | 'jobs' | 'count' | 'millions';
export type Period = 'month' | 'quarter' | 'week';

const grouped = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

export function formatValue(value: number, format: Format): string {
  switch (format) {
    case 'signed-percent':
      return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
    case 'percent':
      return `${value.toFixed(1)}%`;
    case 'jobs': {
      // Payroll changes are published in thousands.
      const jobs = Math.round(value * 1000);
      return `${jobs > 0 ? '+' : ''}${grouped.format(jobs)}`;
    }
    case 'count':
      return grouped.format(value);
    case 'millions':
      return `${(value / 1000).toFixed(2)} million`;
  }
}

/** "October 2026", "Q3 2026" or "the week to 7 November", from FRED's observation date. */
export function periodLabel(date: string, period: Period): string {
  const at = new Date(`${date}T12:00:00Z`);
  if (period === 'quarter') {
    return `Q${Math.floor(at.getUTCMonth() / 3) + 1} ${at.getUTCFullYear()}`;
  }
  if (period === 'week') {
    const day = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'long',
    });
    return `the week to ${day.format(at)}`;
  }
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(at);
}

export interface ReleaseResult {
  /** "October 2026", or empty for the Fed. */
  period: string;
  body: string;
  short: string;
  /** Set when the figures came through a data service rather than the agency itself. */
  via?: string;
}
