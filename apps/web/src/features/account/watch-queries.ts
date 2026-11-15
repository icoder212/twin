import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  economicStateSchema,
  instructionReplySchema,
  marketSearchResultSchema,
  marketsStateSchema,
  newsStateSchema,
  type MarketsState,
  type MarketWatchUpdate,
  type EconomicState,
  type EconomicWatchUpdate,
  type NewsState,
  type NewsWatchUpdate,
} from '@twindesk/core';
import { qk } from '@/app/query-keys';
import { realRequest, useRealAccount } from './real-account';

/** Claude can take a while to read an instruction, longer than the usual request timeout. */
const INSTRUCTION_TIMEOUT_MS = 60_000;

/** The owner's watch on US releases and what is coming up, kept fresh while the page is open. */
export function useEconomic() {
  const signedIn = useRealAccount((s) => s.status.signedIn);
  return useQuery({
    queryKey: qk.economic,
    queryFn: () => realRequest('/v1/economic', { schema: economicStateSchema }),
    enabled: signedIn,
    refetchInterval: 60_000,
  });
}

function useStateUpdate<T extends EconomicState | NewsState | MarketsState>(
  key: readonly string[],
) {
  const queryClient = useQueryClient();
  return (state: T) => {
    queryClient.setQueryData(key, state);
    // Saving a watch can change where its alerts go.
    void queryClient.invalidateQueries({ queryKey: qk.notifyRoot });
  };
}

export function useSaveWatch() {
  const update = useStateUpdate<EconomicState>(qk.economic);
  return useMutation({
    mutationFn: (body: EconomicWatchUpdate) =>
      realRequest('/v1/economic/watch', { method: 'PUT', body, schema: economicStateSchema }),
    onSuccess: update,
  });
}

export function useStopWatch() {
  const update = useStateUpdate<EconomicState>(qk.economic);
  return useMutation({
    mutationFn: () =>
      realRequest('/v1/economic/watch', { method: 'DELETE', schema: economicStateSchema }),
    onSuccess: update,
  });
}

/** The news the owner follows and the latest items sent. */
export function useNews() {
  const signedIn = useRealAccount((s) => s.status.signedIn);
  return useQuery({
    queryKey: qk.news,
    queryFn: () => realRequest('/v1/news', { schema: newsStateSchema }),
    enabled: signedIn,
    refetchInterval: 60_000,
  });
}

export function useSaveNews() {
  const update = useStateUpdate<NewsState>(qk.news);
  return useMutation({
    mutationFn: (body: NewsWatchUpdate) =>
      realRequest('/v1/news/watch', { method: 'PUT', body, schema: newsStateSchema }),
    onSuccess: update,
  });
}

export function useStopNews() {
  const update = useStateUpdate<NewsState>(qk.news);
  return useMutation({
    mutationFn: () => realRequest('/v1/news/watch', { method: 'DELETE', schema: newsStateSchema }),
    onSuccess: update,
  });
}

export function useInstruction() {
  return useMutation({
    mutationFn: (text: string) =>
      realRequest('/v1/instructions', {
        method: 'POST',
        body: { text },
        schema: instructionReplySchema,
        timeoutMs: INSTRUCTION_TIMEOUT_MS,
      }),
  });
}

/** The owner's market watchlist with live prices, refreshed each minute while the page is open. */
export function useMarkets() {
  const signedIn = useRealAccount((s) => s.status.signedIn);
  return useQuery({
    queryKey: qk.markets,
    queryFn: () => realRequest('/v1/markets', { schema: marketsStateSchema }),
    enabled: signedIn,
    refetchInterval: 60_000,
  });
}

/** Markets at the price source matching `term`; searches start at two characters. */
export function useMarketSearch(term: string) {
  const signedIn = useRealAccount((s) => s.status.signedIn);
  return useQuery({
    queryKey: qk.marketSearch(term),
    queryFn: () =>
      realRequest(`/v1/markets/search?q=${encodeURIComponent(term)}`, {
        schema: z.array(marketSearchResultSchema),
      }),
    enabled: signedIn && term.length >= 2,
    staleTime: 60_000,
  });
}

export function useSaveMarkets() {
  const update = useStateUpdate<MarketsState>(qk.markets);
  return useMutation({
    mutationFn: (body: MarketWatchUpdate) =>
      realRequest('/v1/markets/watch', { method: 'PUT', body, schema: marketsStateSchema }),
    onSuccess: update,
  });
}

export function useStopMarkets() {
  const update = useStateUpdate<MarketsState>(qk.markets);
  return useMutation({
    mutationFn: () =>
      realRequest('/v1/markets/watch', { method: 'DELETE', schema: marketsStateSchema }),
    onSuccess: update,
  });
}
