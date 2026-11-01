import type { z } from 'zod';
import { ApiError } from '../api/errors';

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

/** Small deterministic PRNG so seeded demo data looks the same on every load. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tzOffsetMinutes(timezone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** The instant at which the wall clock in `timezone` reads `hhmm`, `dayOffset` days from today. */
export function atLocalTime(
  timezone: string,
  hhmm: string,
  dayOffset = 0,
  now: Date = new Date(),
): Date {
  const offset = tzOffsetMinutes(timezone, now);
  const local = new Date(now.getTime() + offset * 60_000);
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + dayOffset, h, m) -
      offset * 60_000,
  );
}

export function minutesSinceMidnight(timezone: string, now: Date = new Date()): number {
  const local = new Date(now.getTime() + tzOffsetMinutes(timezone, now) * 60_000);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

export function weekdayIn(timezone: string, now: Date = new Date()): number {
  const local = new Date(now.getTime() + tzOffsetMinutes(timezone, now) * 60_000);
  return local.getUTCDay();
}

export function minutesAgo(minutes: number, now: number = Date.now()): string {
  return new Date(now - minutes * 60_000).toISOString();
}

/** Validates input the way the server will, turning Zod issues into a field-level ApiError. */
export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || 'form';
    fieldErrors[key] ??= issue.message;
  }
  throw new ApiError('validation', 'Some details need fixing.', { status: 422, fieldErrors });
}

export function notFound(what: string): never {
  throw new ApiError('not-found', `We could not find that ${what}.`, { status: 404 });
}
