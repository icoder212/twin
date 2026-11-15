import {
  ArrowDownRight,
  ArrowUpRight,
  ChartCandlestick,
  Minus,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import {
  DEFAULT_MARKET_STEP,
  MARKET_STEP_CHOICES,
  MAX_WATCHED_MARKETS,
  type MarketQuote,
  type MarketSearchResult,
  type MarketsState,
  type MarketWatch,
  type WatchChannel,
  type WatchedMarket,
} from '@twindesk/core';
import { cn } from '@/lib/cn';
import { toastError } from '@/lib/mutation';
import { QueryView } from '@/shared/components/QueryView';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/feedback';
import { Checkbox, Input, Select } from '@/shared/ui/field';
import { useRealAccount } from './real-account';
import { useMarketSearch, useMarkets, useSaveMarkets, useStopMarkets } from './watch-queries';
import { listChannels } from './watch-text';

const TYPE_LABELS: Record<string, string> = {
  INDICES: 'Index',
  CURRENCIES: 'Currency or metal',
  COMMODITIES: 'Commodity',
  SHARES: 'Share',
  CRYPTOCURRENCIES: 'Crypto',
};

function marketKind(result: MarketSearchResult): string {
  const type = TYPE_LABELS[result.type] ?? result.type.toLowerCase();
  const expiry = result.expiry === 'DFB' ? 'daily' : result.expiry === '-' ? 'cash' : result.expiry;
  return `${type}, ${expiry}`;
}

function formatNumber(value: number, decimals: number): string {
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function stepLabel(step: number): string {
  return `${step}%`;
}

/**
 * On the Notifications page, with the real account: the markets the owner watches, saved on the
 * server. An alert goes out each time a market's move on the day reaches a new step.
 */
export function MarketMovesCard() {
  const signedIn = useRealAccount((s) => s.status.signedIn);
  const markets = useMarkets();
  if (!signedIn) return null;
  return (
    <Card aria-labelledby="market-moves-title">
      <CardHeader>
        <div>
          <CardTitle id="market-moves-title" className="flex items-center gap-2">
            <ChartCandlestick className="size-4 text-brand-fg" aria-hidden /> Market moves
          </CardTitle>
          <CardDescription>
            An alert each time a market&apos;s move on the day reaches a new step, up or down: with
            a 1% step, at +1%, +2% and so on, and at −1%, −2% and so on. Prices come from IG and are
            checked every minute. Your list is saved to your account.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <QueryView query={markets} loading={<Skeleton className="h-40 rounded-xl" />}>
          {(state) => <MarketMoves state={state} />}
        </QueryView>
      </CardContent>
    </Card>
  );
}

function MarketMoves({ state }: { state: MarketsState }) {
  const save = useSaveMarkets();
  const stop = useStopMarkets();
  const watched = state.watch?.markets ?? [];
  const busy = save.isPending || stop.isPending;
  const extra = state.channels.filter((c): c is WatchChannel => c === 'email' || c === 'whatsapp');

  const commit = (markets: WatchedMarket[], channels?: WatchChannel[]) => {
    if (markets.length === 0) {
      stop.mutate(undefined, { onError: toastError('Could not stop the alerts') });
      return;
    }
    const watch: MarketWatch = { markets };
    save.mutate(
      { watch, ...(channels ? { channels } : {}) },
      { onError: toastError('Could not save your markets') },
    );
  };

  if (!state.available) {
    return (
      <p className="text-[13px] text-fg-muted">
        Prices from IG are not set up on the server yet, so market moves cannot be watched.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {watched.length > 0 ? (
        <Watchlist
          watched={watched}
          quotes={state.quotes}
          busy={busy}
          onStep={(epic, stepPct) =>
            commit(watched.map((m) => (m.epic === epic ? { ...m, stepPct } : m)))
          }
          onRemove={(epic) => commit(watched.filter((m) => m.epic !== epic))}
        />
      ) : (
        <p className="text-[13px] text-fg-subtle">No markets yet. Search below to add one.</p>
      )}
      {state.problem ? <p className="text-xs text-warning">{state.problem}</p> : null}

      <AddMarket
        watched={watched}
        busy={busy}
        onAdd={(result) =>
          commit([
            ...watched,
            { epic: result.epic, name: result.name, stepPct: DEFAULT_MARKET_STEP },
          ])
        }
      />

      <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4">
        <legend className="sr-only">Where market alerts go</legend>
        <span className="text-[13px] text-fg-muted">
          Alerts go to {listChannels(state.channels)}.
        </span>
        {(['whatsapp', 'email'] as const).map((channel) => (
          <label key={channel} className="flex items-center gap-2 text-[13px] text-fg">
            <Checkbox
              checked={extra.includes(channel)}
              disabled={busy || watched.length === 0}
              onChange={(e) =>
                commit(
                  watched,
                  e.target.checked ? [...extra, channel] : extra.filter((c) => c !== channel),
                )
              }
            />
            {channel === 'whatsapp' ? 'WhatsApp' : 'Email'}
          </label>
        ))}
      </fieldset>
    </div>
  );
}

function Watchlist({
  watched,
  quotes,
  busy,
  onStep,
  onRemove,
}: {
  watched: WatchedMarket[];
  quotes: MarketQuote[];
  busy: boolean;
  onStep: (epic: string, stepPct: number) => void;
  onRemove: (epic: string) => void;
}) {
  return (
    <ul className="divide-y divide-line rounded-xl border border-line" aria-label="Watched markets">
      {watched.map((market) => (
        <WatchedRow
          key={market.epic}
          market={market}
          quote={quotes.find((q) => q.epic === market.epic)}
          busy={busy}
          onStep={(step) => onStep(market.epic, step)}
          onRemove={() => onRemove(market.epic)}
        />
      ))}
    </ul>
  );
}

function WatchedRow({
  market,
  quote,
  busy,
  onStep,
  onRemove,
}: {
  market: WatchedMarket;
  quote: MarketQuote | undefined;
  busy: boolean;
  onStep: (step: number) => void;
  onRemove: () => void;
}) {
  const stepId = useId();
  const sent = [
    ...(quote && quote.alertedUp > 0 ? [`+${quote.alertedUp * market.stepPct}%`] : []),
    ...(quote && quote.alertedDown < 0 ? [`−${-quote.alertedDown * market.stepPct}%`] : []),
  ];
  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-fg">
          {market.name}
          {quote && quote.status !== 'TRADEABLE' ? (
            <Badge tone="neutral">{quote.status === 'CLOSED' ? 'Closed' : 'Not trading'}</Badge>
          ) : null}
        </p>
        <p className="mt-0.5 text-[12px] text-fg-subtle">
          {sent.length > 0 ? `Alerted today at ${sent.join(' and ')}` : 'No alerts today yet'}
        </p>
      </div>
      <div className="flex items-center gap-3 sm:justify-end">
        <Move quote={quote} />
        <label htmlFor={stepId} className="sr-only">
          Alert step for {market.name}
        </label>
        <div className="w-24">
          <Select
            id={stepId}
            value={market.stepPct}
            disabled={busy}
            onChange={(e) => onStep(Number(e.target.value))}
          >
            {MARKET_STEP_CHOICES.map((step) => (
              <option key={step} value={step}>
                Every {stepLabel(step)}
              </option>
            ))}
          </Select>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Stop watching ${market.name}`}
          disabled={busy}
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}

/** Price and the change on the day, with an arrow and sign so it never relies on colour. */
function Move({ quote }: { quote: MarketQuote | undefined }) {
  if (!quote || quote.price === null || quote.changePct === null) {
    return <span className="w-36 text-right text-[12px] text-fg-subtle">No price</span>;
  }
  const up = quote.changePct > 0.005;
  const down = quote.changePct < -0.005;
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  return (
    <span className="flex w-36 flex-col items-end font-mono text-[12px] leading-tight">
      <span className="text-fg">{formatNumber(quote.price, quote.decimals)}</span>
      <span
        className={cn(
          'flex items-center gap-0.5',
          up ? 'text-success' : down ? 'text-danger' : 'text-fg-subtle',
        )}
      >
        <Icon className="size-3" aria-hidden />
        {up ? '+' : down ? '−' : ''}
        {Math.abs(quote.changePct).toFixed(2)}%<span className="sr-only"> on the day</span>
      </span>
    </span>
  );
}

function AddMarket({
  watched,
  busy,
  onAdd,
}: {
  watched: WatchedMarket[];
  busy: boolean;
  onAdd: (result: MarketSearchResult) => void;
}) {
  const inputId = useId();
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setTerm(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text]);
  const search = useMarketSearch(term);
  const full = watched.length >= MAX_WATCHED_MARKETS;

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="text-[13px] font-medium text-fg">
        Add a market
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle"
          aria-hidden
        />
        <Input
          id={inputId}
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search IG, e.g. US Tech 100, Spot Gold, Wall Street"
          className="pl-9"
          autoComplete="off"
        />
      </div>
      {full ? (
        <p className="text-xs text-fg-subtle">
          You are watching {MAX_WATCHED_MARKETS} markets, the most allowed.
        </p>
      ) : null}
      {term.length >= 2 ? (
        search.isPending ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : search.isError ? (
          <p role="alert" className="text-xs text-danger">
            The search did not work just now. Try again shortly.
          </p>
        ) : search.data.length === 0 ? (
          <p className="text-[13px] text-fg-subtle">No markets found for “{term}”.</p>
        ) : (
          <ul
            className="divide-y divide-line rounded-xl border border-line"
            aria-label="Search results"
          >
            {search.data.slice(0, 8).map((result) => {
              const added = watched.some((m) => m.epic === result.epic);
              return (
                <li key={result.epic} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-fg">{result.name}</p>
                    <p className="text-[11px] text-fg-subtle">{marketKind(result)}</p>
                  </div>
                  {result.price !== null ? (
                    <span className="hidden font-mono text-[12px] text-fg-muted sm:inline">
                      {formatNumber(result.price, 1)}
                    </span>
                  ) : null}
                  <Button
                    size="sm"
                    variant={added ? 'ghost' : 'secondary'}
                    disabled={added || full || busy}
                    onClick={() => onAdd(result)}
                    aria-label={added ? `${result.name} is already added` : `Add ${result.name}`}
                  >
                    {added ? (
                      'Added'
                    ) : (
                      <>
                        <Plus aria-hidden /> Add
                      </>
                    )}
                  </Button>
                </li>
              );
            })}
          </ul>
        )
      ) : null}
    </div>
  );
}
