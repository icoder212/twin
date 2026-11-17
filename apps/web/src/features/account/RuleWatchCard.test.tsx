import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RuleWatchState } from '@twindesk/core';
import { renderWithApp } from '@/test/render';
import { RuleWatchCard } from './RuleWatchCard';
import { useRealAccount } from './real-account';

const watching: RuleWatchState = {
  available: true,
  limits: { dailyLoss: 500, maxDrawdown: 2_000 },
  channels: ['in-app', 'whatsapp'],
  account: {
    name: 'Spread bet',
    type: 'SPREADBET',
    currency: 'GBP',
    balance: 10_000,
    profitLoss: -380,
    equity: 9_620,
  },
  daily: { from: 10_000, used: 380, pct: 76, alerted: 75 },
  drawdown: { from: 10_200, used: 580, pct: 29, alerted: 0 },
  positions: [
    {
      epic: 'IX.D.NASDAQ.CASH.IP',
      name: 'US Tech 100',
      direction: 'BUY',
      size: 2,
      level: 28_000,
      price: 27_950,
      points: -50,
    },
  ],
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
    if (url.pathname === '/v1/rules/watch' && method === 'PUT') {
      const { limits } = body as { limits: RuleWatchState['limits'] };
      server.state = { ...server.state, limits };
    }
    if (url.pathname === '/v1/rules/watch' && method === 'DELETE') {
      server.state = { ...server.state, limits: null, daily: null, drawdown: null };
    }
    if (url.pathname.startsWith('/v1/rules')) return Response.json(server.state);
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

describe('RuleWatchCard', () => {
  it('shows the account, each limit used and the open positions', async () => {
    renderWithApp(<RuleWatchCard />);
    expect(await screen.findByText('£9,620.00')).toBeVisible();
    expect(screen.getByText('£380.00 of £500.00 (76%)')).toBeVisible();
    expect(screen.getByRole('meter', { name: 'Daily loss used of your limit' })).toHaveAttribute(
      'aria-valuenow',
      '76',
    );
    const positions = screen.getByRole('list', { name: 'Open positions' });
    expect(within(positions).getByText('Buy 2 at 28,000')).toBeVisible();
    expect(within(positions).getByText(/50 pts/)).toBeVisible();
    expect(screen.getByText('Alerts go to the app and WhatsApp.')).toBeVisible();
  });

  it('saves new limits and stops watching', async () => {
    const user = userEvent.setup();
    renderWithApp(<RuleWatchCard />);
    const daily = await screen.findByLabelText('Daily loss limit');
    await user.clear(daily);
    await user.type(daily, '750');
    await user.clear(screen.getByLabelText(/Maximum drawdown/));
    await user.click(screen.getByRole('button', { name: 'Save limits' }));
    await waitFor(() =>
      expect(server.calls.findLast((c) => c.method === 'PUT')?.body).toEqual({
        limits: { dailyLoss: 750 },
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Stop watching' }));
    await waitFor(() =>
      expect(server.calls.some((c) => c.method === 'DELETE' && c.path === '/v1/rules/watch')).toBe(
        true,
      ),
    );
    expect(await screen.findByRole('button', { name: 'Start watching' })).toBeVisible();
  });
});
