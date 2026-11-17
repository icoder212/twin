import { ArrowDownRight, ArrowUpRight, Minus, ShieldCheck } from 'lucide-react';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import {
  RULE_ALERT_STEPS,
  type LimitUse,
  type OpenPosition,
  type RuleLimits,
  type RuleWatchState,
  type WatchChannel,
} from '@twindesk/core';
import { cn } from '@/lib/cn';
import { toastError } from '@/lib/mutation';
import { QueryView } from '@/shared/components/QueryView';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/feedback';
import { Checkbox, Input } from '@/shared/ui/field';
import { useRealAccount } from './real-account';
import { useRuleWatch, useSaveRules, useStopRules } from './watch-queries';
import { listChannels } from './watch-text';

function money(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(value);
  } catch {
    return value.toFixed(2);
  }
}

function points(value: number): string {
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 }).format(Math.abs(value));
}

/** "500" or "1,000.50" as typed, or null when it is not a positive amount. */
function parseAmount(text: string): number | null {
  const value = Number(text.trim().replace(/,/g, ''));
  return text.trim() !== '' && Number.isFinite(value) && value > 0 ? value : null;
}

const STEPS = RULE_ALERT_STEPS.map((s) => `${s}%`).join(', ');

/**
 * On the Notifications page, with the real account: the owner's IG account against their own
 * daily loss limit and maximum drawdown, with the open positions.
 */
export function RuleWatchCard() {
  const signedIn = useRealAccount((s) => s.status.signedIn);
  const rules = useRuleWatch();
  if (!signedIn) return null;
  return (
    <Card aria-labelledby="rule-watch-title">
      <CardHeader>
        <div>
          <CardTitle id="rule-watch-title" className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-brand-fg" aria-hidden /> Rule watch
          </CardTitle>
          <CardDescription>
            Your IG account against your own limits. The day&apos;s loss is measured from the first
            reading after midnight, and the drawdown from the highest equity seen. An alert goes out
            at {STEPS} of each limit. Desk Twin only reads the account; it never trades.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <QueryView query={rules} loading={<Skeleton className="h-40 rounded-xl" />}>
          {(state) => <RuleWatch state={state} />}
        </QueryView>
      </CardContent>
    </Card>
  );
}

function RuleWatch({ state }: { state: RuleWatchState }) {
  const save = useSaveRules();
  const stop = useStopRules();
  const busy = save.isPending || stop.isPending;
  const extra = state.channels.filter((c): c is WatchChannel => c === 'email' || c === 'whatsapp');
  const commit = (limits: RuleLimits, channels?: WatchChannel[]) =>
    save.mutate(
      { limits, ...(channels ? { channels } : {}) },
      { onError: toastError('Could not save your limits') },
    );

  if (!state.available) {
    return (
      <p className="text-[13px] text-fg-muted">
        IG is not set up on the server yet, so the account cannot be watched.
      </p>
    );
  }
  const { account } = state;

  return (
    <div className="space-y-5">
      {state.problem ? <p className="text-xs text-warning">{state.problem}</p> : null}
      {account ? (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Figure label="Equity">{money(account.equity, account.currency)}</Figure>
          <Figure label="Balance">{money(account.balance, account.currency)}</Figure>
          <Figure label="Open profit or loss">{money(account.profitLoss, account.currency)}</Figure>
          <Figure label="Account">
            <span className="text-[13px]">{account.name}</span>
          </Figure>
        </dl>
      ) : null}

      {state.limits && account ? (
        <div className="space-y-3">
          <Use
            label="Daily loss"
            use={state.daily}
            limit={state.limits.dailyLoss}
            currency={account.currency}
            empty="Measured from the first reading today."
          />
          {state.limits.maxDrawdown ? (
            <Use
              label="Drawdown"
              use={state.drawdown}
              limit={state.limits.maxDrawdown}
              currency={account.currency}
              empty="Measured from the next reading."
            />
          ) : null}
        </div>
      ) : null}

      {state.positions.length > 0 ? (
        <ul
          className="divide-y divide-line rounded-xl border border-line"
          aria-label="Open positions"
        >
          {state.positions.map((p, i) => (
            <Position key={`${p.epic}-${i}`} position={p} />
          ))}
        </ul>
      ) : account ? (
        <p className="text-[13px] text-fg-subtle">No open positions.</p>
      ) : null}

      <LimitsForm
        key={JSON.stringify(state.limits)}
        limits={state.limits}
        busy={busy}
        onSave={(limits) => commit(limits)}
        onStop={() => stop.mutate(undefined, { onError: toastError('Could not stop rule watch') })}
      />

      {state.limits ? (
        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4">
          <legend className="sr-only">Where rule alerts go</legend>
          <span className="text-[13px] text-fg-muted">
            Alerts go to {listChannels(state.channels)}.
          </span>
          {(['whatsapp', 'email'] as const).map((channel) => (
            <label key={channel} className="flex items-center gap-2 text-[13px] text-fg">
              <Checkbox
                checked={extra.includes(channel)}
                disabled={busy}
                onChange={(e) =>
                  state.limits &&
                  commit(
                    state.limits,
                    e.target.checked ? [...extra, channel] : extra.filter((c) => c !== channel),
                  )
                }
              />
              {channel === 'whatsapp' ? 'WhatsApp' : 'Email'}
            </label>
          ))}
        </fieldset>
      ) : null}
    </div>
  );
}

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line px-3 py-2.5">
      <dt className="text-[11px] text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 font-mono text-[15px] text-fg">{children}</dd>
    </div>
  );
}

function Use({
  label,
  use,
  limit,
  currency,
  empty,
}: {
  label: string;
  use: LimitUse | null;
  limit: number;
  currency: string;
  empty: string;
}) {
  const pct = use ? Math.min(100, use.pct) : 0;
  return (
    <div className="space-y-1.5">
      <p className="flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
        <span className="font-medium text-fg">{label}</span>
        <span className="font-mono text-fg-muted">
          {use
            ? `${money(use.used, currency)} of ${money(limit, currency)} (${Math.round(use.pct)}%)`
            : `Limit ${money(limit, currency)}`}
        </span>
      </p>
      {use ? (
        <div
          role="meter"
          aria-label={`${label} used of your limit`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          className="h-1.5 overflow-hidden rounded-full bg-surface-2"
        >
          <div
            className={cn(
              'h-full',
              pct >= 90 ? 'bg-danger' : pct >= 50 ? 'bg-warning' : 'bg-brand-fg',
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : (
        <p className="text-[12px] text-fg-subtle">{empty}</p>
      )}
    </div>
  );
}

/** Direction, size and points in or against the position, with an arrow so it never relies on colour. */
function Position({ position: p }: { position: OpenPosition }) {
  const up = (p.points ?? 0) > 0;
  const down = (p.points ?? 0) < 0;
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
      <div className="min-w-0 flex-1">
        <p className="truncate text-fg">{p.name}</p>
        <p className="text-[12px] text-fg-subtle">
          {p.direction === 'BUY' ? 'Buy' : 'Sell'} {p.size} at {points(p.level)}
        </p>
      </div>
      {p.points === null ? (
        <span className="text-[12px] text-fg-subtle">No price</span>
      ) : (
        <span
          className={cn(
            'flex items-center gap-0.5 font-mono text-[12px]',
            up ? 'text-success' : down ? 'text-danger' : 'text-fg-subtle',
          )}
        >
          <Icon className="size-3" aria-hidden />
          {up ? '+' : down ? '−' : ''}
          {points(p.points)} pts
        </span>
      )}
    </li>
  );
}

function LimitsForm({
  limits,
  busy,
  onSave,
  onStop,
}: {
  limits: RuleLimits | null;
  busy: boolean;
  onSave: (limits: RuleLimits) => void;
  onStop: () => void;
}) {
  const dailyId = useId();
  const drawdownId = useId();
  const [daily, setDaily] = useState(limits ? String(limits.dailyLoss) : '');
  const [drawdown, setDrawdown] = useState(limits?.maxDrawdown ? String(limits.maxDrawdown) : '');
  const dailyLoss = parseAmount(daily);
  const maxDrawdown = drawdown.trim() === '' ? undefined : parseAmount(drawdown);
  const valid = dailyLoss !== null && maxDrawdown !== null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (dailyLoss === null || maxDrawdown === null) return;
    onSave({ dailyLoss, ...(maxDrawdown ? { maxDrawdown } : {}) });
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3 border-t border-line pt-4">
      <div className="space-y-1.5">
        <label htmlFor={dailyId} className="text-[13px] font-medium text-fg">
          Daily loss limit
        </label>
        <Input
          id={dailyId}
          inputMode="decimal"
          autoComplete="off"
          value={daily}
          onChange={(e) => setDaily(e.target.value)}
          placeholder="e.g. 500"
          className="w-36 font-mono"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={drawdownId} className="text-[13px] font-medium text-fg">
          Maximum drawdown <span className="font-normal text-fg-subtle">(optional)</span>
        </label>
        <Input
          id={drawdownId}
          inputMode="decimal"
          autoComplete="off"
          value={drawdown}
          onChange={(e) => setDrawdown(e.target.value)}
          placeholder="e.g. 2,000"
          className="w-36 font-mono"
        />
      </div>
      <Button type="submit" size="sm" disabled={!valid || busy}>
        {limits ? 'Save limits' : 'Start watching'}
      </Button>
      {limits ? (
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onStop}>
          Stop watching
        </Button>
      ) : null}
    </form>
  );
}
