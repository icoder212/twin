import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Usage } from '@twindesk/core';
import { renderWithApp } from '@/test/render';
import { UsageCard } from './UsageCard';
import { useRealAccount } from './real-account';

const usage: Usage = {
  month: 'November 2026',
  channels: [
    { channel: 'email', sent: 28, failed: 0, skipped: 0 },
    { channel: 'whatsapp', sent: 10, failed: 37, skipped: 2 },
  ],
  whatsapp: { cap: null, sent: 10, spent: 0.38, balance: 19.62, currency: 'GBP', floor: 10 },
};

/** The Desk Twin server behind /v1, as far as this card uses it. */
const server = {
  state: usage,
  calls: [] as Array<{ method: string; body?: unknown }>,
};

beforeAll(() => {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined;
    server.calls.push({ method, body });
    if (url.pathname === '/v1/usage/cap' && method === 'PUT') {
      const { whatsappCap } = body as { whatsappCap: number | null };
      server.state = { ...server.state, whatsapp: { ...server.state.whatsapp, cap: whatsappCap } };
    }
    if (url.pathname.startsWith('/v1/usage')) return Response.json(server.state);
    return Response.json({ message: 'Not found.' }, { status: 404 });
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  server.state = usage;
  server.calls = [];
  useRealAccount.setState({
    availability: 'available',
    status: { signedIn: true, email: 'owner@example.com' },
  });
});

describe('UsageCard', () => {
  it('shows this month’s messages, the Twilio spend and balance, and each channel', async () => {
    renderWithApp(<UsageCard />);
    expect(await screen.findByText('£0.38')).toBeVisible();
    expect(screen.getByText('£19.62')).toBeVisible();
    expect(screen.getByText('£10.00')).toBeVisible();
    const channels = screen.getByRole('list', { name: 'By channel' });
    expect(within(channels).getByText('37 failed')).toBeVisible();
    expect(within(channels).getByText('2 not sent')).toBeVisible();
  });

  it('sets a monthly WhatsApp cap and removes it', async () => {
    const user = userEvent.setup();
    renderWithApp(<UsageCard />);
    await user.type(await screen.findByLabelText('WhatsApp messages a month, at most'), '200');
    await user.click(screen.getByRole('button', { name: 'Save cap' }));
    await waitFor(() =>
      expect(server.calls.findLast((c) => c.method === 'PUT')?.body).toEqual({ whatsappCap: 200 }),
    );
    expect(await screen.findByRole('meter')).toHaveAttribute('aria-valuenow', '10');

    await user.click(screen.getByRole('button', { name: 'Remove cap' }));
    await waitFor(() =>
      expect(server.calls.findLast((c) => c.method === 'PUT')?.body).toEqual({ whatsappCap: null }),
    );
  });
});
