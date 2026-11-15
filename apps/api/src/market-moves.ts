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
import { loadPreferences } from './settings';
import type { Store } from './store';
import { updateTemplate } from './whatsapp';

/**
 * Market move alerts. Each minute the watched markets are read from IG in one request. An alert
 * goes out the first time a market's move on the day reaches each whole step, up or down: +1%,
 * +2%... and -1%, -2%... with a 1% step. A new trading day starts the steps again.
 */

const WATCH_KEY = 'market-watch';
const STATE_KEY = 'market-moves-state';
/** A ceiling on alerts a day, so a wild session cannot run up messaging costs. */
export const MAX_MOVE_ALERTS_PER_DAY = 40;

interface MarketMoveState {
  /** The previous close the day's change is measured from; a new value means a new day. */
  basis: number;
  up: number;
  down: number;
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

function formatPrice(value: number, decimals: number): string {
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export type MarketMovesOutcome = { status: 'off' } | { status: 'ok'; sent: number; error?: string };

/** One run: read the watched markets and send any new steps. */
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

  for (const market of watch.markets) {
    const snapshot = snapshots.get(market.epic);
    const basis = snapshot ? previousClose(snapshot) : null;
    const known = state.markets[market.epic];
    if (!snapshot || basis === null || basis <= 0 || snapshot.bid === null) {
      if (known) markets[market.epic] = known;
      continue;
    }
    const current =
      known && sameClose(known.basis, basis) ? { ...known } : { basis, up: 0, down: 0 };
    markets[market.epic] = current;
    // Closed or auction-only markets keep their steps, but their prices are not acted on.
    if (snapshot.status !== 'TRADEABLE') continue;

    const changePct = ((snapshot.bid - basis) / basis) * 100;
    const level = moveLevel(changePct, market.stepPct);
    const newStep = (level >= 1 && level > current.up) || (level <= -1 && level < current.down);
    if (!newStep) continue;
    if (level > 0) current.up = level;
    else current.down = level;
    if (state.sent >= MAX_MOVE_ALERTS_PER_DAY) continue;

    const price = mid(snapshot.bid, snapshot.offer) ?? snapshot.bid;
    const move = describeMove(changePct);
    const at = formatPrice(price, snapshot.decimals);
    const change = snapshot.bid - basis;
    try {
      await notify(
        { config, store, fetch: deps.fetch, now },
        {
          topic: 'price',
          urgency: 'important',
          title: `${market.name} ${move} today`,
          body: `${market.name} is at ${at}, ${move} (${change >= 0 ? '+' : '−'}${formatPrice(Math.abs(change), snapshot.decimals)}) from the previous close of ${formatPrice(basis, snapshot.decimals)}. Prices from IG. You get an alert at each ${market.stepPct}% step on the day.`,
          href: '/notifications',
          whatsapp: updateTemplate(config, market.name, `${move} today at ${at}`),
        },
      );
      state.sent += 1;
      sent += 1;
    } catch (error) {
      // Try this step again next run.
      if (level > 0) current.up = level - 1;
      else current.down = level + 1;
      firstError ??= error instanceof Error ? error.message : 'Could not send';
    }
  }

  await store.putSetting(STATE_KEY, JSON.stringify({ ...state, markets }), now);
  return { status: 'ok', sent, ...(firstError ? { error: firstError } : {}) };
}

/** The watchlist with live prices and today's steps, for the app. */
export async function marketsState(deps: IgDeps): Promise<MarketsState> {
  const { config, store } = deps;
  const watch = await loadMarketWatch(store);
  const { routing } = await loadPreferences(store);
  const base = { available: igReady(config), watch, channels: routing.price, quotes: [] };
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
    };
  });
  return { ...base, quotes };
}
