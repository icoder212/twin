import Anthropic from '@anthropic-ai/sdk';
import type { Config } from './config';
import type { Store } from './store';

/** A client for this server's Claude key, or null when none is set. */
export function claudeClient(
  config: Config,
  fetchFn: typeof fetch,
  timeout = 45_000,
): Anthropic | null {
  if (!config.ANTHROPIC_API_KEY) return null;
  return new Anthropic({
    apiKey: config.ANTHROPIC_API_KEY,
    fetch: fetchFn,
    maxRetries: 1,
    timeout,
  });
}

/** Counts one use against a daily allowance, so costs stay bounded. False once it is used up. */
export async function spendAllowance(
  store: Store,
  key: string,
  limit: number,
  now: number,
): Promise<boolean> {
  const today = new Date(now).toISOString().slice(0, 10);
  let used = 0;
  try {
    const saved = JSON.parse((await store.getSetting(key)) ?? 'null') as {
      day?: unknown;
      count?: unknown;
    } | null;
    if (saved?.day === today && typeof saved.count === 'number') used = saved.count;
  } catch {
    used = 0;
  }
  if (used >= limit) return false;
  await store.putSetting(key, JSON.stringify({ day: today, count: used + 1 }), now);
  return true;
}
