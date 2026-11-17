import {
  dayKeyIn,
  MAX_OPEN_POSITIONS_SHOWN,
  ruleLimitsSchema,
  ruleStep,
  type LimitUse,
  type RuleLimits,
  type RuleWatchState,
  type TradingAccount,
} from '@twindesk/core';
import { igReady, openPositions, preferredAccount, type IgAccount, type IgDeps } from './ig';
import { notify } from './notify';
import { loadPreferences } from './settings';
import type { Store } from './store';
import { updateTemplate } from './whatsapp';

/**
 * Rule watch on the owner's IG account. Each minute the account's equity (balance plus open
 * profit or loss) is read. The day's loss is measured from the first reading after midnight on
 * the owner's clock, and the drawdown from the highest equity seen. An alert goes out the first
 * time each share of a limit is reached: 50%, 75%, 90% and 100%.
 */

const LIMITS_KEY = 'rule-limits';
const STATE_KEY = 'rule-watch-state';

interface WatchState {
  day: string;
  /** Equity at the day's first reading. */
  start: number;
  /** The highest equity seen since the limits were set. */
  peak: number;
  dailyAlerted: number;
  drawdownAlerted: number;
}

export async function loadRuleLimits(store: Store): Promise<RuleLimits | null> {
  try {
    const parsed = ruleLimitsSchema.safeParse(
      JSON.parse((await store.getSetting(LIMITS_KEY)) ?? ''),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Saves the limits. Changed limits can alert again from 50%, but the day's starting equity and
 * the peak stay, so changing a setting mid-session does not hide a loss already made. Stopping
 * forgets both.
 */
export async function saveRuleLimits(store: Store, limits: RuleLimits | null, now: number) {
  const previous = await loadRuleLimits(store);
  await store.putSetting(LIMITS_KEY, limits ? JSON.stringify(limits) : '', now);
  const state = await loadState(store);
  if (!limits || !state) {
    await store.putSetting(STATE_KEY, '', now);
  } else if (JSON.stringify(previous) !== JSON.stringify(limits)) {
    const reset: WatchState = { ...state, dailyAlerted: 0, drawdownAlerted: 0 };
    await store.putSetting(STATE_KEY, JSON.stringify(reset), now);
  }
}

async function loadState(store: Store): Promise<WatchState | null> {
  try {
    const parsed = JSON.parse((await store.getSetting(STATE_KEY)) ?? '') as WatchState;
    return typeof parsed.day === 'string' && Number.isFinite(parsed.start) ? parsed : null;
  } catch {
    return null;
  }
}

function equityOf(account: IgAccount): number {
  return Math.round((account.balance + account.profitLoss) * 100) / 100;
}

/** Today's state after this reading: a new day starts from this equity. */
function advance(state: WatchState | null, day: string, equity: number): WatchState {
  if (!state) return { day, start: equity, peak: equity, dailyAlerted: 0, drawdownAlerted: 0 };
  const peak = Math.max(state.peak, equity);
  // A new high clears the drawdown alerts, so a later fall alerts again.
  const drawdownAlerted = peak > state.peak ? 0 : state.drawdownAlerted;
  return state.day === day
    ? { ...state, peak, drawdownAlerted }
    : { day, start: equity, peak, dailyAlerted: 0, drawdownAlerted };
}

function limitUse(from: number, equity: number, limit: number, alerted: number): LimitUse {
  const used = Math.max(0, Math.round((from - equity) * 100) / 100);
  return { from, used, pct: (used / limit) * 100, alerted };
}

function money(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export type RuleWatchOutcome = { status: 'off' } | { status: 'ok'; sent: number; error?: string };

/** One run: read the account and send any new share of a limit reached. */
export async function runRuleWatch(deps: IgDeps): Promise<RuleWatchOutcome> {
  const { config, store, now } = deps;
  const limits = await loadRuleLimits(store);
  if (!limits || !igReady(config)) return { status: 'off' };

  let account: IgAccount;
  try {
    account = await preferredAccount(deps);
  } catch (error) {
    return { status: 'ok', sent: 0, error: error instanceof Error ? error.message : 'IG failed' };
  }
  const equity = equityOf(account);
  const day = dayKeyIn(config.TIMEZONE, new Date(now));
  const state = advance(await loadState(store), day, equity);
  const at = money(equity, account.currency);
  let sent = 0;
  let firstError: string | undefined;

  const checks = [
    {
      key: 'dailyAlerted' as const,
      limit: limits.dailyLoss,
      usage: limitUse(state.start, equity, limits.dailyLoss, state.dailyAlerted),
      name: 'daily loss limit',
      from: 'the start of the day',
    },
    ...(limits.maxDrawdown
      ? [
          {
            key: 'drawdownAlerted' as const,
            limit: limits.maxDrawdown,
            usage: limitUse(state.peak, equity, limits.maxDrawdown, state.drawdownAlerted),
            name: 'maximum drawdown',
            from: 'its highest',
          },
        ]
      : []),
  ];
  for (const { key, limit, usage, name, from } of checks) {
    const step = ruleStep(usage.pct);
    if (step <= state[key]) continue;
    const used = money(usage.used, account.currency);
    const of = money(limit, account.currency);
    const reached = step >= 100 ? `Your ${name} is reached` : `${step}% of your ${name} used`;
    try {
      await notify(
        { config, store, fetch: deps.fetch, now },
        {
          topic: 'loss-limit',
          urgency: step >= 90 ? 'critical' : 'important',
          title: reached,
          body: `The account is down ${used} from ${money(usage.from, account.currency)} at ${from}: ${Math.round(usage.pct)}% of your ${of} ${name}. Equity is ${at}. Figures from IG.`,
          href: '/notifications',
          whatsapp: updateTemplate(
            config,
            `your ${name}`,
            `${step >= 100 ? 'reached' : `${step}% used`}, ${used} of ${of}; equity ${at}`,
          ),
        },
      );
      state[key] = step;
      sent += 1;
    } catch (error) {
      // Not recorded: the same step is tried again next run.
      firstError ??= error instanceof Error ? error.message : 'Could not send';
    }
  }

  await store.putSetting(STATE_KEY, JSON.stringify(state), now);
  return { status: 'ok', sent, ...(firstError ? { error: firstError } : {}) };
}

/** The account, how much of each limit is used and the open positions, for the app. */
export async function ruleWatchState(deps: IgDeps): Promise<RuleWatchState> {
  const { config, store } = deps;
  const limits = await loadRuleLimits(store);
  const { routing } = await loadPreferences(store);
  const base: RuleWatchState = {
    available: igReady(config),
    limits,
    channels: routing['loss-limit'],
    account: null,
    daily: null,
    drawdown: null,
    positions: [],
  };
  if (!base.available) return base;
  let igAccount: IgAccount;
  let positions: Awaited<ReturnType<typeof openPositions>>;
  try {
    [igAccount, positions] = await Promise.all([preferredAccount(deps), openPositions(deps)]);
  } catch {
    return {
      ...base,
      problem: 'The account could not be read from IG just now. Try again shortly.',
    };
  }
  const equity = equityOf(igAccount);
  const account: TradingAccount = { ...igAccount, equity };
  const state = await loadState(store);
  const day = dayKeyIn(config.TIMEZONE, new Date(deps.now));
  const today = state && state.day === day ? state : null;
  return {
    ...base,
    account,
    daily:
      limits && today ? limitUse(today.start, equity, limits.dailyLoss, today.dailyAlerted) : null,
    drawdown:
      limits?.maxDrawdown && state
        ? limitUse(Math.max(state.peak, equity), equity, limits.maxDrawdown, state.drawdownAlerted)
        : null,
    positions: positions.slice(0, MAX_OPEN_POSITIONS_SHOWN).map((p) => ({
      ...p,
      points:
        p.price === null
          ? null
          : Math.round((p.direction === 'BUY' ? p.price - p.level : p.level - p.price) * 100) / 100,
    })),
  };
}
