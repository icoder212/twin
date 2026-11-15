import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketSearchResult, MarketsState, MarketWatch } from '@twindesk/core';
import { renderWithApp } from '@/test/render';
import { MarketMovesCard } from './MarketMovesCard';
import { useRealAccount } from './real-account';

const NASDAQ = 'IX.D.NASDAQ.CASH.IP';
const GOLD = 'CS.D.USCGC.TODAY.IP';

const watching: MarketsState = {
  available: true,
  watch: { markets: [{ epic: NASDAQ, name: 'US Tech 100', stepPct: 1 }] },
  channels: ['in-app', 'whatsapp'],
  quotes: [
    {
      epic: NASDAQ,
      name: 'US Tech 100',
      status: 'TRADEABLE',
      price: 28_301,
      change: 300,
      changePct: 1.07,
      previousClose: 28_000,
      decimals: 1,
      alertedUp: 1,
      alertedDown: 0,
    },
  ],
};

const goldResult: MarketSearchResult = {
  epic: GOLD,
  name: 'Spot Gold',
  type: 'CURRENCIES',
  expiry: 'DFB',
  status: 'TRADEABLE',
  price: 3_897.6,
  changePct: 0.3,
};

/** The Desk Twin server behind /v1, as far as this card uses it. */
const server = {
  state: watching,
  calls: [] as Array<{ method: string; path: string; body?: unknown }>,
};

beforeAll(() => {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined;
    server.calls.push({ method, path: url.pathname, body });
    if (url.pathname === '/v1/markets/search') return Response.json([goldResult]);
    if (url.pathname === '/v1/markets/watch' && method === 'PUT') {
      const { watch } = body as { watch: MarketWatch };
      server.state = { ...server.state, watch };
    }
    if (url.pathname === '/v1/markets/watch' && method === 'DELETE') {
      server.state = { ...server.state, watch: null, quotes: [] };
    }
    if (url.pathname.startsWith('/v1/markets')) return Response.json(server.state);
    return Response.json({ message: 'Not found.' }, { status: 404 });
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  server.state = watching;
  server.calls = [];
  useRealAccount.setState({
    availability: 'available',
    status: { signedIn: true, email: 'owner@example.com' },
  });
});

describe('MarketMovesCard', () => {
  it('shows each market with its price, move on the day and alerts sent today', async () => {
    renderWithApp(<MarketMovesCard />);
    const list = await screen.findByRole('list', { name: 'Watched markets' });
    expect(within(list).getByText('US Tech 100')).toBeVisible();
    expect(within(list).getByText('28,301.0')).toBeVisible();
    expect(within(list).getByText(/\+1\.07%/)).toBeVisible();
    expect(within(list).getByText('Alerted today at +1%')).toBeVisible();
    expect(screen.getByText('Alerts go to the app and WhatsApp.')).toBeVisible();
  });

  it('adds a market from IG search, saved to the account with a 1% step', async () => {
    const user = userEvent.setup();
    renderWithApp(<MarketMovesCard />);
    await user.type(await screen.findByLabelText('Add a market'), 'gold');
    await user.click(await screen.findByRole('button', { name: 'Add Spot Gold' }));

    await waitFor(() =>
      expect(server.calls.find((c) => c.method === 'PUT')?.body).toEqual({
        watch: {
          markets: [
            { epic: NASDAQ, name: 'US Tech 100', stepPct: 1 },
            { epic: GOLD, name: 'Spot Gold', stepPct: 1 },
          ],
        },
      }),
    );
    expect(
      await screen.findByRole('button', { name: 'Spot Gold is already added' }),
    ).toBeDisabled();
  });

  it('changes the step, and stops watching when the last market is removed', async () => {
    const user = userEvent.setup();
    renderWithApp(<MarketMovesCard />);
    await user.selectOptions(await screen.findByLabelText('Alert step for US Tech 100'), '2');
    await waitFor(() =>
      expect(server.calls.findLast((c) => c.method === 'PUT')?.body).toEqual({
        watch: { markets: [{ epic: NASDAQ, name: 'US Tech 100', stepPct: 2 }] },
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Stop watching US Tech 100' }));
    await waitFor(() =>
      expect(
        server.calls.some((c) => c.method === 'DELETE' && c.path === '/v1/markets/watch'),
      ).toBe(true),
    );
    expect(await screen.findByText('No markets yet. Search below to add one.')).toBeVisible();
  });
});
