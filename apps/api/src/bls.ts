import { z } from 'zod';
import type { UsRelease } from '@twindesk/core';
import { formatValue, periodLabel, type Format, type ReleaseResult } from './figures';

/**
 * The Bureau of Labor Statistics' own API, updated as each news release goes out:
 * https://www.bls.gov/developers/. Changes are worked out from the published indexes, as BLS
 * does, so they match the release.
 */

const API = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';

type Calc = 'm/m' | 'y/y' | 'change' | 'level';

interface BlsSeries {
  id: string;
  calc: Calc;
  format: Format;
  label: string;
  short: string;
}

interface BlsEvent {
  /** How many months the figures trail the release: October's CPI comes out in November. */
  lagMonths: number;
  series: BlsSeries[];
}

export const BLS_EVENTS: Partial<Record<UsRelease, BlsEvent>> = {
  cpi: {
    lagMonths: 1,
    series: [
      {
        id: 'CUSR0000SA0',
        calc: 'm/m',
        format: 'signed-percent',
        label: 'All items, on the month',
        short: 'm/m',
      },
      {
        id: 'CUUR0000SA0',
        calc: 'y/y',
        format: 'percent',
        label: 'All items, on the year',
        short: 'y/y',
      },
      {
        id: 'CUSR0000SA0L1E',
        calc: 'm/m',
        format: 'signed-percent',
        label: 'Excluding food and energy, on the month',
        short: 'core m/m',
      },
      {
        id: 'CUUR0000SA0L1E',
        calc: 'y/y',
        format: 'percent',
        label: 'Excluding food and energy, on the year',
        short: 'core y/y',
      },
    ],
  },
  ppi: {
    lagMonths: 1,
    series: [
      {
        id: 'WPSFD4',
        calc: 'm/m',
        format: 'signed-percent',
        label: 'Final demand, on the month',
        short: 'm/m',
      },
      {
        id: 'WPUFD4',
        calc: 'y/y',
        format: 'percent',
        label: 'Final demand, on the year',
        short: 'y/y',
      },
    ],
  },
  jobs: {
    lagMonths: 1,
    series: [
      {
        id: 'CES0000000001',
        calc: 'change',
        format: 'jobs',
        label: 'Non-farm payrolls',
        short: 'payrolls',
      },
      {
        id: 'LNS14000000',
        calc: 'level',
        format: 'percent',
        label: 'Unemployment rate',
        short: 'unemployment',
      },
      {
        id: 'CES0500000003',
        calc: 'm/m',
        format: 'signed-percent',
        label: 'Average hourly earnings, on the month',
        short: 'earnings m/m',
      },
    ],
  },
  jolts: {
    lagMonths: 2,
    series: [
      {
        id: 'JTS000000000000000JOL',
        calc: 'level',
        format: 'millions',
        label: 'Job openings',
        short: 'openings',
      },
    ],
  },
};

const responseSchema = z.object({
  status: z.string().max(100),
  Results: z
    .object({
      series: z
        .array(
          z.object({
            seriesID: z.string().max(40),
            data: z
              .array(z.object({ year: z.string(), period: z.string(), value: z.string() }))
              .max(500),
          }),
        )
        .max(50),
    })
    .optional(),
});

interface Point {
  /** Months since year 0, so neighbouring months differ by one. */
  month: number;
  value: number;
}

/** Monthly observations, newest first. Annual averages (M13) are left out. */
function monthly(data: Array<{ year: string; period: string; value: string }>): Point[] {
  return data
    .map((d) => {
      const m = /^M(0[1-9]|1[0-2])$/.exec(d.period);
      const value = Number(d.value);
      return m && Number.isFinite(value)
        ? { month: Number(d.year) * 12 + Number(m[1]) - 1, value }
        : null;
    })
    .filter((p): p is Point => p !== null)
    .sort((a, b) => b.month - a.month);
}

function valueAt(points: Point[], index: number, calc: Calc): number | null {
  const point = points[index];
  if (!point) return null;
  const at = (month: number) => points.find((p) => p.month === month)?.value;
  const before = calc === 'y/y' ? at(point.month - 12) : at(point.month - 1);
  if (calc === 'level') return point.value;
  if (before === undefined) return null;
  if (calc === 'change') return point.value - before;
  return (point.value / before - 1) * 100;
}

const isoMonth = (month: number) =>
  `${Math.floor(month / 12)}-${String((month % 12) + 1).padStart(2, '0')}-01`;

/** The figures from the release due at `at`, or null until BLS has them. */
export async function blsResult(
  apiKey: string,
  event: UsRelease,
  at: number,
  fetchFn: typeof fetch,
): Promise<ReleaseResult | null> {
  const spec = BLS_EVENTS[event];
  if (!spec) return null;
  const year = new Date(at).getUTCFullYear();
  const response = await fetchFn(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      seriesid: [...new Set(spec.series.map((s) => s.id))],
      // Two years back, so last month's change on the year is there in January too.
      startyear: String(year - 2),
      endyear: String(year),
      registrationkey: apiKey,
    }),
  });
  if (!response.ok) throw new Error(`BLS returned ${response.status}`);
  const parsed = responseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success || parsed.data.status !== 'REQUEST_SUCCEEDED' || !parsed.data.Results) {
    throw new Error('BLS sent something unexpected');
  }
  const bySeries = new Map(parsed.data.Results.series.map((s) => [s.seriesID, monthly(s.data)]));

  const released = new Date(at);
  const expected = released.getUTCFullYear() * 12 + released.getUTCMonth() - spec.lagMonths;
  let period: number | undefined;
  const lines: string[] = [];
  const shorts: string[] = [];
  for (const series of spec.series) {
    const points = bySeries.get(series.id) ?? [];
    const latest = points[0];
    // The first series decides whether the release is in; the rest must be for the same month.
    if (period === undefined) {
      if (!latest || latest.month < expected) return null;
      period = latest.month;
    }
    if (!latest || latest.month !== period) continue;
    const now = valueAt(points, 0, series.calc);
    if (now === null) continue;
    const before = valueAt(points, 1, series.calc);
    const value = formatValue(now, series.format);
    lines.push(
      `${series.label}: ${value}${before === null ? '' : ` (previously ${formatValue(before, series.format)})`}`,
    );
    shorts.push(`${series.short} ${value}`);
  }
  if (period === undefined || lines.length === 0) return null;
  return {
    period: periodLabel(isoMonth(period), 'month'),
    body: `${lines.join('. ')}.`,
    short: shorts.join(', '),
  };
}
