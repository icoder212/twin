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

/** `short` names the ones that also go in the brief's one-line summary. */
export const FUNDS: ReadonlyArray<{ symbol: string; label: string; short?: string }> = [
  { symbol: 'SPY', label: 'S&P 500 (SPY)', short: 'S&P 500' },
  { symbol: 'QQQ', label: 'Nasdaq 100 (QQQ)', short: 'Nasdaq 100' },
  { symbol: 'DIA', label: 'Dow Jones (DIA)' },
  { symbol: 'IWM', label: 'Russell 2000 (IWM)' },
  { symbol: 'GLD', label: 'Gold (GLD)', short: 'gold' },
  { symbol: 'USO', label: 'US oil (USO)', short: 'oil' },
];

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

/** Lines for the brief, and the main moves in a few words for its summary. */
export interface Markets {
  lines: string[];
  moves: string[];
}

interface Quote {
  line: string;
  move?: string;
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

async function fundQuotes(config: Config, fetchFn: typeof fetch, now: number): Promise<Quote[]> {
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
  return FUNDS.flatMap(({ symbol, label, short }) => {
    const closes = (bars[symbol] ?? []).map((b) => ({ day: dayKeyIn(NEW_YORK, b.t), value: b.c }));
    const pair = lastTwo(closes, before);
    if (!pair) return [];
    const [previous, last] = pair;
    const moved = change(last.value, previous.value);
    return [
      {
        line: `${label}: ${amount(last.value, 2)}, ${moved} on ${weekday(last.day)}`,
        ...(short ? { move: `${short} ${moved}` } : {}),
      },
    ];
  });
}

async function bitcoinQuote(config: Config, fetchFn: typeof fetch, now: number): Promise<Quote[]> {
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
    {
      line: `Bitcoin (BTC/USD): ${amount(last.value, 0)}, ${change(last.value, previous.value)} on ${weekday(last.day)} (UTC day)`,
    },
  ];
}

/** The ECB's euro reference rates for USD and GBP, crossed for GBP/USD. */
async function rateQuotes(fetchFn: typeof fetch): Promise<Quote[]> {
  const response = await fetchFn(ECB_RATES, { headers: { Accept: 'text/csv' } });
  if (!response.ok) throw new Error(`ECB rates returned ${response.status}`);
  const [header = '', ...rows] = (await response.text()).trim().split(/\r?\n/);
  const columns = header.split(',');
  const at = (name: string) => columns.indexOf(name);
  const [currency, period, value] = [at('CURRENCY'), at('TIME_PERIOD'), at('OBS_VALUE')];
  if (currency < 0 || period < 0 || value < 0)
    throw new Error('ECB rates sent something unexpected');
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
  return pairs.map(([name, rate]) => ({
    line: `${name}: ${amount(rate(last), 4)}, ${change(rate(last), rate(previous))} (ECB reference rate, ${weekday(last)})`,
    ...(name === 'GBP/USD' ? { move: `GBP/USD ${amount(rate(last), 4)}` } : {}),
  }));
}

const MOVERS = 'https://data.alpaca.markets/v1beta1/screener/stocks/movers?top=50';
/** The SEC's line for penny stocks; below it the list fills with warrants and sub-dollar shares. */
export const MIN_MOVER_PRICE = 5;
const MOVERS_SHOWN = 5;

const moverSchema = z.object({
  symbol: z.string().regex(/^[A-Z][A-Z0-9.]{0,9}$/),
  percent_change: z.number(),
  price: z.number(),
});
const moversSchema = z.object({ gainers: z.array(moverSchema), losers: z.array(moverSchema) });
const assetSchema = z.object({ name: z.string().max(200) });

/** "Focus Universal Inc. Common Stock" reads as "Focus Universal Inc.". */
function companyName(name: string): string {
  return name
    .replace(
      /\s+(?:Class [A-Z]\s+)?(?:Common Stock|Ordinary Shares?|Common Shares?|American Depositary Shares?)\b.*$/i,
      '',
    )
    .trim();
}

/** The company's name from Alpaca's asset list; the symbol alone when it cannot be found. */
async function assetName(config: Config, symbol: string, fetchFn: typeof fetch) {
  const host = config.ALPACA_KEY_ID?.startsWith('PK')
    ? 'https://paper-api.alpaca.markets'
    : 'https://api.alpaca.markets';
  try {
    const response = await fetchFn(`${host}/v2/assets/${encodeURIComponent(symbol)}`, {
      headers: {
        Accept: 'application/json',
        'APCA-API-KEY-ID': config.ALPACA_KEY_ID ?? '',
        'APCA-API-SECRET-KEY': config.ALPACA_SECRET_KEY ?? '',
      },
    });
    const parsed = assetSchema.safeParse(await response.json().catch(() => null));
    return response.ok && parsed.success ? companyName(parsed.data.name) : '';
  } catch {
    return '';
  }
}

/**
 * The largest moves either way across US stocks at the last close, from Alpaca's market movers
 * (close against the previous close). Stocks under $5 are left out.
 */
export async function movers(config: Config, fetchFn: typeof fetch): Promise<Markets> {
  if (!config.ALPACA_KEY_ID || !config.ALPACA_SECRET_KEY) throw new Error('No Alpaca keys');
  const response = await fetchFn(MOVERS, {
    headers: {
      Accept: 'application/json',
      'APCA-API-KEY-ID': config.ALPACA_KEY_ID,
      'APCA-API-SECRET-KEY': config.ALPACA_SECRET_KEY,
    },
  });
  if (!response.ok) throw new Error(`Alpaca movers returned ${response.status}`);
  const parsed = moversSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new Error('Alpaca movers sent something unexpected');
  const top = [...parsed.data.gainers, ...parsed.data.losers]
    .filter((m) => m.price >= MIN_MOVER_PRICE && Math.abs(m.percent_change) >= 1)
    .sort((a, b) => Math.abs(b.percent_change) - Math.abs(a.percent_change))
    .slice(0, MOVERS_SHOWN);
  const names = await Promise.all(top.map((m) => assetName(config, m.symbol, fetchFn)));
  const moved = (pct: number) => `${pct > 0 ? 'up' : 'down'} ${Math.abs(pct).toFixed(1)}%`;
  return {
    lines: top.map((m, i) => {
      const name = names[i] ? ` (${names[i]})` : '';
      return `${m.symbol}${name}: ${amount(m.price, 2)}, ${moved(m.percent_change)}`;
    }),
    moves: top.map((m) => `${m.symbol} ${moved(m.percent_change)}`),
  };
}

/**
 * One line per instrument. A source that cannot be reached says so in its place rather than
 * holding up the rest of the brief.
 */
export async function markets(
  config: Config,
  fetchFn: typeof fetch,
  now: number,
): Promise<Markets> {
  const [funds, bitcoin, rates] = await Promise.allSettled([
    fundQuotes(config, fetchFn, now),
    bitcoinQuote(config, fetchFn, now),
    rateQuotes(fetchFn),
  ]);
  const quotes: Quote[] = [
    ...(funds.status === 'fulfilled'
      ? funds.value
      : [{ line: 'US fund prices could not be fetched.' }]),
    ...(rates.status === 'fulfilled'
      ? rates.value
      : [{ line: 'ECB exchange rates could not be fetched.' }]),
    ...(bitcoin.status === 'fulfilled' ? bitcoin.value : []),
  ];
  return {
    lines: quotes.map((q) => q.line),
    moves: quotes.flatMap((q) => (q.move ? [q.move] : [])),
  };
}
