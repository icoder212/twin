import { z } from 'zod';
import { dayKeyIn } from '@twindesk/core';
import type { Config } from './config';
import { zonedInstant } from './economic';

/**
 * The markets section of the morning brief: each instrument's last completed close and its change
 * on the day, facts only. Index levels are not free in time for a UK morning, so US-listed funds
 * stand in for the indices. Funds and Bitcoin come from Alpaca; exchange rates are the ECB's
 * reference rates, from the ECB itself.
 */

const STOCK_BARS = 'https://data.alpaca.markets/v2/stocks/bars';
const CRYPTO_BARS = 'https://data.alpaca.markets/v1beta3/crypto/us/bars';
const ECB_RATES =
  'https://data-api.ecb.europa.eu/service/data/EXR/D.USD+GBP.EUR.SP00.A?lastNObservations=2&format=csvdata';

export const FUNDS = [
  { symbol: 'SPY', label: 'S&P 500 (SPY)' },
  { symbol: 'QQQ', label: 'Nasdaq 100 (QQQ)' },
  { symbol: 'DIA', label: 'Dow Jones (DIA)' },
  { symbol: 'IWM', label: 'Russell 2000 (IWM)' },
  { symbol: 'GLD', label: 'Gold (GLD)' },
  { symbol: 'USO', label: 'US oil (USO)' },
] as const;

const NEW_YORK = 'America/New_York';
const DAY_MS = 86_400_000;
/** Alpaca's free plan serves consolidated (SIP) prices once they are 15 minutes old. */
const SIP_DELAY_MS = 16 * 60_000;
/** New York time by which the 16:00 close is final and past that delay. */
const SESSION_CLOSED = '16:20';

const barsSchema = z.object({
  bars: z.record(z.string(), z.array(z.object({ t: z.string(), c: z.number() }))).nullable(),
});

interface Close {
  day: string;
  value: number;
}

/** "up 0.4%", "down 1.2%" or "unchanged", to one decimal place. */
export function change(last: number, previous: number): string {
  const pct = Math.round(((last - previous) / previous) * 1000) / 10;
  if (pct === 0) return 'unchanged';
  return `${pct > 0 ? 'up' : 'down'} ${Math.abs(pct).toFixed(1)}%`;
}

function amount(value: number, digits: number): string {
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function weekday(day: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(`${day}T12:00:00Z`),
  );
}

async function alpacaBars(config: Config, url: URL, fetchFn: typeof fetch) {
  if (!config.ALPACA_KEY_ID || !config.ALPACA_SECRET_KEY) throw new Error('No Alpaca keys');
  const response = await fetchFn(url, {
    headers: {
      Accept: 'application/json',
      'APCA-API-KEY-ID': config.ALPACA_KEY_ID,
      'APCA-API-SECRET-KEY': config.ALPACA_SECRET_KEY,
    },
  });
  if (!response.ok) throw new Error(`Alpaca prices returned ${response.status}`);
  const parsed = barsSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new Error('Alpaca prices sent something unexpected');
  return parsed.data.bars ?? {};
}

/** The last two closes from days before `before`, oldest first; later days are still trading. */
function lastTwo(closes: Close[], before: string): [Close, Close] | null {
  const [previous, last] = closes.filter((c) => c.day < before).slice(-2);
  return previous && last ? [previous, last] : null;
}

async function fundLines(config: Config, fetchFn: typeof fetch, now: number): Promise<string[]> {
  const url = new URL(STOCK_BARS);
  url.searchParams.set('symbols', FUNDS.map((f) => f.symbol).join(','));
  url.searchParams.set('timeframe', '1Day');
  url.searchParams.set('start', new Date(now - 10 * DAY_MS).toISOString());
  url.searchParams.set('end', new Date(now - SIP_DELAY_MS).toISOString());
  url.searchParams.set('feed', 'sip');
  url.searchParams.set('adjustment', 'raw');
  url.searchParams.set('limit', '1000');
  const bars = await alpacaBars(config, url, fetchFn);
  const today = dayKeyIn(NEW_YORK, new Date(now));
  // Today's session counts once the closing auction is over and its prices are past the delay.
  const before =
    now >= zonedInstant(today, SESSION_CLOSED, NEW_YORK)
      ? dayKeyIn(NEW_YORK, new Date(now), 1)
      : today;
  return FUNDS.flatMap(({ symbol, label }) => {
    const closes = (bars[symbol] ?? []).map((b) => ({ day: dayKeyIn(NEW_YORK, b.t), value: b.c }));
    const pair = lastTwo(closes, before);
    if (!pair) return [];
    const [previous, last] = pair;
    return [
      `${label}: ${amount(last.value, 2)}, ${change(last.value, previous.value)} on ${weekday(last.day)}`,
    ];
  });
}

async function bitcoinLine(config: Config, fetchFn: typeof fetch, now: number) {
  const url = new URL(CRYPTO_BARS);
  url.searchParams.set('symbols', 'BTC/USD');
  url.searchParams.set('timeframe', '1Day');
  url.searchParams.set('start', new Date(now - 5 * DAY_MS).toISOString());
  const bars = await alpacaBars(config, url, fetchFn);
  const closes = (bars['BTC/USD'] ?? []).map((b) => ({ day: b.t.slice(0, 10), value: b.c }));
  const pair = lastTwo(closes, new Date(now).toISOString().slice(0, 10));
  if (!pair) return [];
  const [previous, last] = pair;
  return [
    `Bitcoin (BTC/USD): ${amount(last.value, 0)}, ${change(last.value, previous.value)} on ${weekday(last.day)} (UTC day)`,
  ];
}

/** The ECB's euro reference rates for USD and GBP, crossed for GBP/USD. */
async function rateLines(fetchFn: typeof fetch): Promise<string[]> {
  const response = await fetchFn(ECB_RATES, { headers: { Accept: 'text/csv' } });
  if (!response.ok) throw new Error(`ECB rates returned ${response.status}`);
  const [header = '', ...rows] = (await response.text()).trim().split(/\r?\n/);
  const columns = header.split(',');
  const at = (name: string) => columns.indexOf(name);
  const [currency, period, value] = [at('CURRENCY'), at('TIME_PERIOD'), at('OBS_VALUE')];
  if (currency < 0 || period < 0 || value < 0) throw new Error('ECB rates sent something unexpected');
  // Later columns hold quoted titles that may contain commas; the ones read here come first.
  const perEuro = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const cells = row.split(',');
    const rate = Number(cells[value]);
    const code = cells[currency] ?? '';
    const day = cells[period] ?? '';
    if (!Number.isFinite(rate) || rate <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    perEuro.set(code, (perEuro.get(code) ?? new Map<string, number>()).set(day, rate));
  }
  const usd = perEuro.get('USD');
  const gbp = perEuro.get('GBP');
  if (!usd || !gbp) throw new Error('ECB rates sent something unexpected');
  const [previous, last] = [...usd.keys()].filter((d) => gbp.has(d)).sort();
  if (!previous || !last) return [];
  const pairs: Array<[string, (day: string) => number]> = [
    ['GBP/USD', (d) => usd.get(d)! / gbp.get(d)!],
    ['EUR/USD', (d) => usd.get(d)!],
    ['EUR/GBP', (d) => gbp.get(d)!],
  ];
  return pairs.map(
    ([name, rate]) =>
      `${name}: ${amount(rate(last), 4)}, ${change(rate(last), rate(previous))} (ECB reference rate, ${weekday(last)})`,
  );
}

/**
 * One line per instrument. A source that cannot be reached says so in its place rather than
 * holding up the rest of the brief.
 */
export async function marketLines(
  config: Config,
  fetchFn: typeof fetch,
  now: number,
): Promise<string[]> {
  const [funds, bitcoin, rates] = await Promise.allSettled([
    fundLines(config, fetchFn, now),
    bitcoinLine(config, fetchFn, now),
    rateLines(fetchFn),
  ]);
  return [
    ...(funds.status === 'fulfilled' ? funds.value : ['US fund prices could not be fetched.']),
    ...(rates.status === 'fulfilled' ? rates.value : ['ECB exchange rates could not be fetched.']),
    ...(bitcoin.status === 'fulfilled' ? bitcoin.value : []),
  ];
}
