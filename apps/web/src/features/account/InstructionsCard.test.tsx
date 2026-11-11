import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EconomicState, InstructionReply, NewsState } from '@twindesk/core';
import { renderWithApp } from '@/test/render';
import { InstructionsCard } from './InstructionsCard';
import { useRealAccount } from './real-account';

const noReleases: EconomicState = {
  claude: true,
  fred: true,
  watch: null,
  channels: ['in-app', 'whatsapp'],
  upcoming: [],
};
const noNews: NewsState = {
  claude: true,
  headlines: true,
  watch: null,
  channels: ['in-app'],
  recent: [],
};

const proposal: InstructionReply = {
  kind: 'proposal',
  message: 'I will remind you before CPI and the Fed decision, and follow Nvidia and tariffs.',
  watch: { events: ['fomc', 'cpi'], remindMinutes: 15, results: true },
  channels: ['whatsapp'],
  news: { tickers: ['NVDA'], topics: ['tariffs'], centralBanks: [] },
};

/** The Desk Twin server behind /v1, as far as this card uses it. */
const server = {
  economic: noReleases,
  news: noNews,
  saved: [] as Array<{ path: string; body: unknown }>,
  instructions: [] as string[],
};

beforeAll(() => {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const { pathname } = new URL(String(input));
    const body = init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined;
    if (pathname === '/v1/instructions') {
      server.instructions.push((body as { text: string }).text);
      return Response.json(proposal);
    }
    if (init?.method === 'PUT') server.saved.push({ path: pathname, body });
    if (pathname === '/v1/economic/watch' && init?.method === 'PUT') {
      server.economic = {
        ...server.economic,
        watch: (body as { watch: EconomicState['watch'] }).watch,
        upcoming: [
          {
            key: 'cpi|2026-11-12',
            event: 'cpi',
            at: '2026-11-12T13:30:00.000Z',
            status: 'published',
            details: 'All items, on the month: +0.3% (previously +0.2%).',
          },
        ],
      };
    }
    if (pathname === '/v1/news/watch' && init?.method === 'PUT') {
      server.news = {
        ...server.news,
        watch: (body as { watch: NewsState['watch'] }).watch,
        recent: [
          {
            id: 'news|benzinga|1',
            source: 'benzinga',
            headline: 'Nvidia beats estimates',
            url: 'https://www.benzinga.com/1',
            at: '2026-11-10T16:00:00.000Z',
            match: 'NVDA',
          },
        ],
      };
    }
    if (pathname.startsWith('/v1/economic')) return Response.json(server.economic);
    if (pathname.startsWith('/v1/news')) return Response.json(server.news);
    return Response.json({ message: 'Not found.' }, { status: 404 });
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  server.economic = noReleases;
  server.news = noNews;
  server.saved = [];
  server.instructions = [];
  useRealAccount.setState({
    availability: 'available',
    status: { signedIn: true, email: 'owner@example.com' },
  });
});

describe('InstructionsCard', () => {
  it('shows what Claude understood and saves it only once confirmed', async () => {
    const user = userEvent.setup();
    renderWithApp(<InstructionsCard />);
    expect(await screen.findByText('Nothing is being watched yet.')).toBeVisible();

    await user.type(
      screen.getByLabelText('Your instruction'),
      'Remind me before CPI and the Fed on WhatsApp, and follow Nvidia and tariffs',
    );
    await user.click(screen.getByRole('button', { name: 'Send to Claude' }));

    expect(await screen.findByRole('status')).toHaveTextContent('follow Nvidia and tariffs');
    const check = screen.getByRole('region', { name: 'Check before saving' });
    expect(within(check).getByRole('checkbox', { name: /Consumer prices \(CPI\)/ })).toBeChecked();
    expect(within(check).getByRole('checkbox', { name: /GDP/ })).not.toBeChecked();
    expect(within(check).getByText(/release alerts will go to the app and WhatsApp/)).toBeVisible();
    expect(within(check).getByLabelText('Companies')).toHaveValue('NVDA');
    expect(within(check).getByLabelText('Topics')).toHaveValue('tariffs');
    expect(server.saved).toHaveLength(0);

    await user.click(within(check).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(server.saved).toHaveLength(2));
    expect(server.saved).toEqual([
      { path: '/v1/economic/watch', body: { watch: proposal.watch, channels: ['whatsapp'] } },
      { path: '/v1/news/watch', body: { watch: proposal.news } },
    ]);

    expect(await screen.findByRole('heading', { name: 'US economic releases' })).toBeVisible();
    expect(screen.getByText('All items, on the month: +0.3% (previously +0.2%).')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'News' })).toBeVisible();
    expect(screen.getByRole('link', { name: /Nvidia beats estimates/ })).toHaveAttribute(
      'href',
      'https://www.benzinga.com/1',
    );
  });

  it('offers the settings without Claude', async () => {
    server.economic = { ...noReleases, claude: false };
    server.news = { ...noNews, claude: false };
    const user = userEvent.setup();
    renderWithApp(<InstructionsCard />);
    expect(await screen.findByLabelText('Your instruction')).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Choose releases yourself' }));
    let check = screen.getByRole('region', { name: 'Check before saving' });
    expect(within(check).getByRole('checkbox', { name: /Jobs report/ })).toBeChecked();
    await user.click(within(check).getByRole('switch', { name: /published figures/ }));
    await user.selectOptions(within(check).getByLabelText('Reminder'), 'No reminder');
    expect(within(check).getByRole('alert')).toHaveTextContent('Choose a summary, a reminder');
    await user.selectOptions(within(check).getByLabelText('Summary of the next day'), 'At 18:00');
    expect(within(check).queryByRole('alert')).toBeNull();
    await user.selectOptions(within(check).getByLabelText('Summary of the next day'), 'No summary');
    expect(within(check).getByRole('button', { name: 'Confirm' })).toBeDisabled();
    await user.click(within(check).getByRole('button', { name: 'Cancel' }));

    await user.click(screen.getByRole('button', { name: 'Choose news yourself' }));
    check = screen.getByRole('region', { name: 'Check before saving' });
    await user.type(within(check).getByLabelText('Companies'), 'nvda, aapl, not-a-ticker!');
    await user.click(within(check).getByRole('checkbox', { name: /European Central Bank/ }));
    await user.click(within(check).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(server.saved).toHaveLength(1));
    expect(server.saved[0]).toEqual({
      path: '/v1/news/watch',
      body: { watch: { tickers: ['NVDA', 'AAPL'], topics: [], centralBanks: ['fed', 'boe'] } },
    });
  });

  it('stays hidden in the demo', () => {
    useRealAccount.setState({ status: { signedIn: false } });
    renderWithApp(<InstructionsCard />);
    expect(screen.queryByText('Instructions for Desk Twin')).toBeNull();
  });
});
