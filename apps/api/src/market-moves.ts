import {
  dayKeyIn,
  describeMove,
  marketWatchSchema,
  moveLevel,
  type MarketQuote,
  type MarketsState,
  type MarketWatch,
} from '@twindesk/core';
import { igReady, marketSnapshots, mid, type IgDeps, type IgSnapshot } from './ig';
import { notify } from './notify';
import { loadSessions } from './session-notes';
import { loadPreferences } from './settings';
import type { Store } from './store';
import { updateTemplate } from './whatsapp';

/**
 * Market move alerts. Each minute the watched markets are read from IG in one request. An alert
 * goes out the first time a market's move on the day reaches each whole step, up or down: +1%,
 * +2%... and -1%, -2%... with a 1% step. A new trading day starts the steps again. A level the
 * owner set alerts when the price crosses it, once each way a trading day.
 */

const WATCH_KEY = 'market-watch';
const STATE_KEY = 'market-moves-state';
/** A ceiling on alerts a day, so a wild session cannot run up messaging costs. */
export const MAX_MOVE_ALERTS_PER_DAY = 40;

/** The side of a level the price was last seen on, and the crossings sent today. */
interface LevelState {
  side: 'above' | 'below';
  up?: boolean;
  down?: boolean;
}

interface MarketMoveState {
  /** The previous close the day's change is measured from; a new value means a new day. */
  basis: number;
  up: number;
  down: number;
  /** Keyed by the level as written, e.g. "4000". */
  levels?: Record<string, LevelState>;
}

interface MovesState {
  day: string;
  sent: number;
  markets: Record<string, MarketMoveState>;
}

export async function loadMarketWatch(store: Store): Promise<MarketWatch | null> {
  const raw = await store.getSetting(WATCH_KEY);
  if (!raw) return null;
  try {
    const parsed = marketWatchSchema.nullable().safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function saveMarketWatch(
  store: Store,
  watch: MarketWatch | null,
  now: number,
): Promise<void> {
  await store.putSetting(WATCH_KEY, JSON.stringify(watch), now);
}

async function loadState(store: Store): Promise<MovesState> {
  const raw = await store.getSetting(STATE_KEY);
  try {
    const parsed = raw ? (JSON.parse(raw) as MovesState) : null;
    if (parsed && typeof parsed.day === 'string' && parsed.markets) return parsed;
  } catch {
    // Start again below.
  }
  return { day: '', sent: 0, markets: {} };
}

/** IG measures the day's change on the bid, so bid minus change is the previous close. */
function previousClose(snapshot: IgSnapshot): number | null {
  if (snapshot.bid === null || snapshot.netChange === null) return null;
  return Math.round((snapshot.bid - snapshot.netChange) * 1e6) / 1e6;
}

function sameClose(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.abs(b) * 1e-7;
}

export function formatPrice(value: number, decimals: number): string {
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export type MarketMovesOutcome = { status: 'off' } | { status: 'ok'; sent: number; error?: string };

/** A new trading day keeps the side of each level, as a price can cross one overnight. */
function newDay(basis: number, known: MarketMoveState | undefined): MarketMoveState {
  const levels = Object.fromEntries(
    Object.entries(known?.levels ?? {}).map(([key, level]) => [key, { side: level.side }]),
  );
  return { basis, up: 0, down: 0, levels };
}

/** One run: read the watched markets and send any new steps and level crossings. */
export async function runMarketMoves(deps: IgDeps): Promise<MarketMovesOutcome> {
  const { config, store, now } = deps;
  const watch = await loadMarketWatch(store);
  if (!watch || !igReady(config)) return { status: 'off' };

  let snapshots: Map<string, IgSnapshot>;
  try {
    snapshots = await marketSnapshots(
      deps,
      watch.markets.map((m) => m.epic),
    );
  } catch (error) {
    return { status: 'ok', sent: 0, error: error instanceof Error ? error.message : 'IG failed' };
  }

  const state = await loadState(store);
  const day = dayKeyIn(config.TIMEZONE, new Date(now));
  if (state.day !== day) Object.assign(state, { day, sent: 0 });
  const markets: Record<string, MarketMoveState> = {};
  let sent = 0;
  let firstError: string | undefined;

  /** True when the alert is dealt with: sent, or over the day's ceiling. False to try again. */
  const send = async (alert: { title: string; body: string; whatsapp: string; name: string }) => {
    if (state.sent >= MAX_MOVE_ALERTS_PER_DAY) return true;
    try {
      await notify(
        { config, store, fetch: deps.fetch, now },
        {
          topic: 'price',
          urgency: 'important',
          title: alert.title,
          body: alert.body,
          href: '/notifications',
          whatsapp: updateTemplate(config, alert.name, alert.whatsapp),
        },
      );
      state.sent += 1;
      sent += 1;
      return true;
    } catch (error) {
      firstError ??= error instanceof Error ? error.message : 'Could not send';
      return false;
    }
  };

  for (const market of watch.markets) {
    const snapshot = snapshots.get(market.epic);
    const basis = snapshot ? previousClose(snapshot) : null;
    const known = state.markets[market.epic];
    if (!snapshot || basis === null || basis <= 0 || snapshot.bid === null) {
      if (known) markets[market.epic] = known;
      continue;
    }
    const current =
      known && sameClose(known.basis, basis)
        ? { ...known, levels: { ...known.levels } }
        : newDay(basis, known);
    markets[market.epic] = current;
    // Closed or auction-only markets keep their steps, but their prices are not acted on.
    if (snapshot.status !== 'TRADEABLE') continue;

    const price = mid(snapshot.bid, snapshot.offer) ?? snapshot.bid;
    const changePct = ((snapshot.bid - basis) / basis) * 100;
    const move = describeMove(changePct);
    const at = formatPrice(price, snapshot.decimals);

    const level = moveLevel(changePct, market.stepPct);
    if ((level >= 1 && level > current.up) || (level <= -1 && level < current.down)) {
      const change = snapshot.bid - basis;
      const done = await send({
        name: market.name,
        title: `${market.name} ${move} today`,
        body: `${market.name} is at ${at}, ${move} (${change >= 0 ? '+' : '−'}${formatPrice(Math.abs(change), snapshot.decimals)}) from the previous close of ${formatPrice(basis, snapshot.decimals)}. Prices from IG. You get an alert at each ${market.stepPct}% step on the day.`,
        whatsapp: `${move} today at ${at}`,
      });
      // Not sent: the same step is tried again next run.
      if (done && level > 0) current.up = level;
      else if (done) current.down = level;
    }

    const levels: Record<string, LevelState> = {};
    for (const value of market.levels ?? []) {
      const key = String(value);
      const before = current.levels?.[key];
      const side = price >= value ? 'above' : 'below';
      levels[key] = { ...before, side };
      // The first sighting only records the side; a crossing needs a side to cross from.
      if (!before || before.side === side) continue;
      const way = side === 'above' ? 'up' : 'down';
      if (before[way]) continue;
      const shown = formatPrice(value, snapshot.decimals);
      const done = await send({
        name: market.name,
        title: `${market.name} ${side} ${shown}`,
        body: `${market.name} crossed ${side} your level of ${shown} and is at ${at}, ${move} on the day. Prices from IG. Each level alerts once each way a day.`,
        whatsapp: `crossed ${side} ${shown}, now at ${at}`,
      });
      if (!done) levels[key] = before;
      else
        levels[key] =
          way === 'up' ? { ...before, side, up: true } : { ...before, side, down: true };
    }
    current.levels = levels;
  }

  await store.putSetting(STATE_KEY, JSON.stringify({ ...state, markets }), now);
  return { status: 'ok', sent, ...(firstError ? { error: firstError } : {}) };
}

/** The watchlist with live prices and today's steps, for the app. */
export async function marketsState(deps: IgDeps): Promise<MarketsState> {
  const { config, store } = deps;
  const watch = await loadMarketWatch(store);
  const { routing } = await loadPreferences(store);
  const base = {
    available: igReady(config),
    watch,
    channels: routing.price,
    quotes: [],
    sessions: await loadSessions(store),
  };
  if (!watch || !igReady(config)) return base;
  let snapshots: Map<string, IgSnapshot>;
  try {
    snapshots = await marketSnapshots(
      deps,
      watch.markets.map((m) => m.epic),
    );
  } catch {
    return { ...base, problem: 'Prices could not be read from IG just now. Try again shortly.' };
  }
  const state = await loadState(store);
  const quotes: MarketQuote[] = watch.markets.map((market) => {
    const snapshot = snapshots.get(market.epic);
    const basis = snapshot ? previousClose(snapshot) : null;
    const steps = state.markets[market.epic];
    const today = steps && basis !== null && sameClose(steps.basis, basis) ? steps : null;
    return {
      epic: market.epic,
      name: snapshot?.name ?? market.name,
      status: snapshot?.status ?? 'UNKNOWN',
      price: snapshot ? mid(snapshot.bid, snapshot.offer) : null,
      change: snapshot?.netChange ?? null,
      changePct: snapshot?.bid != null && basis ? ((snapshot.bid - basis) / basis) * 100 : null,
      previousClose: basis,
      decimals: snapshot?.decimals ?? 2,
      alertedUp: today?.up ?? 0,
      alertedDown: today?.down ?? 0,
      crossed: Object.entries(today?.levels ?? {}).flatMap(([key, level]) => [
        ...(level.up ? [{ level: Number(key), way: 'up' as const }] : []),
        ...(level.down ? [{ level: Number(key), way: 'down' as const }] : []),
      ]),
    };
  });
  return { ...base, quotes };
}
