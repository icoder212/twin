import { z } from 'zod';

/**
 * FRED, the St. Louis Fed's free data service: release dates for US statistics and the series
 * they publish. https://fred.stlouisfed.org/docs/api/fred/
 */

const BASE = 'https://api.stlouisfed.org/fred';
const USER_AGENT = 'DeskTwin/0.1 (+https://twin.alchmai.com)';

export class FredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FredError';
  }
}

export type FredUnits = 'lin' | 'chg' | 'pch' | 'pc1';

async function get<T>(
  path: string,
  params: Record<string, string>,
  apiKey: string,
  schema: z.ZodType<T>,
  fetchFn: typeof fetch,
): Promise<T> {
  const url = new URL(`${BASE}/${path}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('file_type', 'json');
  // The URL carries the key, so errors name the path only.
  const response = await fetchFn(url, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
  });
  if (!response.ok) throw new FredError(`FRED ${path} returned ${response.status}`);
  const parsed = schema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new FredError(`FRED ${path} sent something unexpected`);
  return parsed.data;
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Scheduled dates for one release between two days, future ones included. */
export async function releaseDates(
  apiKey: string,
  releaseId: number,
  from: string,
  to: string,
  fetchFn: typeof fetch,
): Promise<string[]> {
  const data = await get(
    'release/dates',
    {
      release_id: String(releaseId),
      realtime_start: from,
      realtime_end: to,
      include_release_dates_with_no_data: 'true',
      sort_order: 'asc',
      limit: '60',
    },
    apiKey,
    z.object({ release_dates: z.array(z.object({ date: day })).max(1000) }),
    fetchFn,
  );
  return data.release_dates.map((d) => d.date).filter((d) => d >= from && d <= to);
}

/** "2026-11-10 07:41:02-06", FRED's format, in milliseconds since the epoch. */
export function parseUpdated(value: string): number | null {
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})([+-]\d{2})(\d{2})?$/.exec(value.trim());
  if (!match) return null;
  const at = Date.parse(`${match[1]}T${match[2]}${match[3]}:${match[4] ?? '00'}`);
  return Number.isNaN(at) ? null : at;
}

/** When FRED last changed a series: after a release, the moment its figures arrived. */
export async function seriesUpdatedAt(
  apiKey: string,
  seriesId: string,
  fetchFn: typeof fetch,
): Promise<number | null> {
  const data = await get(
    'series',
    { series_id: seriesId },
    apiKey,
    z.object({ seriess: z.array(z.object({ last_updated: z.string().max(40) })).min(1) }),
    fetchFn,
  );
  return parseUpdated(data.seriess[0]?.last_updated ?? '');
}

export interface Observation {
  date: string;
  value: number;
}

/** The newest observations first, in the units asked for. FRED marks gaps with ".". */
export async function latestObservations(
  apiKey: string,
  seriesId: string,
  units: FredUnits,
  fetchFn: typeof fetch,
  count = 2,
): Promise<Observation[]> {
  const data = await get(
    'series/observations',
    { series_id: seriesId, units, sort_order: 'desc', limit: String(count + 2) },
    apiKey,
    z.object({
      observations: z.array(z.object({ date: day, value: z.string().max(40) })).max(100),
    }),
    fetchFn,
  );
  return data.observations
    .map((o) => ({ date: o.date, value: Number(o.value) }))
    .filter((o) => Number.isFinite(o.value))
    .slice(0, count);
}
