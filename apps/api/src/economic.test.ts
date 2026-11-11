import { beforeEach, describe, expect, it } from 'vitest';
import type { EconomicState } from '@twindesk/core';
import { handleApi } from './api';
import {
  fetchResult,
  runEconomic,
  saveWatch,
  sendSummary,
  upcomingReleases,
  zonedInstant,
} from './economic';
import { fedNumber, FED_PRESS_RELEASES, readDecision } from './fomc';
import { parseUpdated } from './fred';
import { parseRss } from './rss';
import { startSession } from './session';
import { loadPreferences } from './settings';
import { APP, baseConfig, memoryStore } from './test-support';

const config = { ...baseConfig, FRED_API_KEY: 'a'.repeat(32) };
const CPI_AT = Date.parse('2026-11-12T13:30:00Z');
const minutes = (n: number) => CPI_AT + n * 60_000;

/** Fake FRED, Fed and Meta endpoints, recording what the server asked for and sent. */
function fakeNetwork() {
  const state = {
    cpiUpdated: '2026-11-12 07:25:00-06',
    statementPublished: false,
    fredCalls: [] as string[],
    whatsapp: [] as Array<{ name: string; params: string[] }>,
  };
  const observations: Record<string, Array<{ date: string; value: string }>> = {
    'CPIAUCSL|pch': [
      { date: '2026-10-01', value: '0.29874' },
      { date: '2026-09-01', value: '0.2' },
    ],
    'CPIAUCNS|pc1': [
      { date: '2026-10-01', value: '2.91' },
      { date: '2026-09-01', value: '3.04' },
    ],
    'CPILFESL|pch': [
      { date: '2026-10-01', value: '.' },
      { date: '2026-09-01', value: '0.25' },
      { date: '2026-08-01', value: '0.31' },
    ],
    'CPILFENS|pc1': [{ date: '2026-10-01', value: '3.0' }],
  };
  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname === 'api.stlouisfed.org') {
      state.fredCalls.push(url.pathname);
      expect(url.searchParams.get('api_key')).toBe(config.FRED_API_KEY);
      if (url.pathname.endsWith('/release/dates')) {
        return Response.json({
          release_dates:
            url.searchParams.get('release_id') === '10'
              ? [{ date: '2026-11-12' }, { date: '2026-12-10' }, { date: '2027-03-01' }]
              : [],
        });
      }
      if (url.pathname.endsWith('/series')) {
        return Response.json({ seriess: [{ last_updated: state.cpiUpdated }] });
      }
      const key = `${url.searchParams.get('series_id')}|${url.searchParams.get('units')}`;
      return Response.json({ observations: observations[key] ?? [] });
    }
    if (url.hostname === 'www.federalreserve.gov') {
      if (url.pathname.endsWith('.xml')) {
        return new Response(
          state.statementPublished
            ? `<rss><channel><item><title>Federal Reserve issues FOMC statement</title><link><![CDATA[https://www.federalreserve.gov/newsevents/pressreleases/monetary20261209a.htm]]></link><pubDate><![CDATA[Wed, 09 Dec 2026 19:00:00 GMT]]></pubDate></item></channel></rss>`
            : '<rss><channel></channel></rss>',
        );
      }
      return new Response(
        '<p>The Committee decided to lower the target range for the federal funds rate by 1/4 percentage point to 3-1/2 to 3-3/4&nbsp;percent.</p>',
      );
    }
    if (url.hostname === 'graph.facebook.com') {
      const body = JSON.parse(String(init?.body)) as {
        template: { name: string; components: Array<{ parameters: Array<{ text: string }> }> };
      };
      state.whatsapp.push({
        name: body.template.name,
        params: body.template.components[0]!.parameters.map((p) => p.text),
      });
      return Response.json({ messages: [{ id: `wamid.${state.whatsapp.length}` }] });
    }
    throw new Error(`Unexpected request to ${url.href}`);
  }) as typeof fetch;
  return { state, fetch: fakeFetch };
}

describe('release times', () => {
  it('turns a New York release time into the right instant either side of the clock change', () => {
    expect(new Date(zonedInstant('2026-11-12', '08:30', 'America/New_York')).toISOString()).toBe(
      '2026-11-12T13:30:00.000Z',
    );
    expect(new Date(zonedInstant('2026-07-15', '08:30', 'America/New_York')).toISOString()).toBe(
      '2026-07-15T12:30:00.000Z',
    );
    // The US moves its clocks on 8 March 2026, weeks before the UK.
    expect(new Date(zonedInstant('2026-03-09', '08:30', 'America/New_York')).toISOString()).toBe(
      '2026-03-09T12:30:00.000Z',
    );
  });

  it('reads FRED update times', () => {
    expect(parseUpdated('2026-11-12 07:41:02-06')).toBe(Date.parse('2026-11-12T13:41:02Z'));
    expect(parseUpdated('soon')).toBeNull();
  });
});

describe('the Fed decision', () => {
  it('reads fractions the way the statement writes them', () => {
    expect(fedNumber('3-3/4')).toBe(3.75);
    expect(fedNumber('1/4')).toBe(0.25);
    expect(fedNumber('4')).toBe(4);
    expect(fedNumber('four')).toBeNull();
  });

  it('puts the decision in plain figures, and says nothing when the wording is new', () => {
    expect(
      readDecision(
        'The Committee decided to maintain the target range for the federal funds rate at 3-3/4 to 4 percent.',
      ),
    ).toEqual({
      body: 'The target range for the federal funds rate was kept, at 3.75% to 4.00%.',
      short: 'target range kept, at 3.75% to 4.00%',
    });
    expect(
      readDecision(
        'decided to raise the target range for the federal funds rate by 1/2 percentage point to 4-1/2 to 4-3/4 percent',
      )?.short,
    ).toBe('target range raised by 0.50 percentage points, to 4.50% to 4.75%');
    expect(readDecision('The Committee will hold its next meeting in January.')).toBeNull();
  });

  it('keeps only Fed press release links from the feed', () => {
    const items = parseRss(
      '<item><title>A</title><link>https://example.com/x</link><pubDate>Wed, 28 Oct 2026 18:00:00 GMT</pubDate></item>' +
        '<item><title>B &amp; C&#39;s</title><link><![CDATA[https://www.federalreserve.gov/newsevents/pressreleases/b.htm]]></link><pubDate><![CDATA[Wed, 28 Oct 2026 18:00:00 GMT]]></pubDate></item>',
      FED_PRESS_RELEASES,
    );
    expect(items.map((i) => i.title)).toEqual(["B & C's"]);
  });
});

describe('watching US releases', () => {
  let store: ReturnType<typeof memoryStore>;
  let net: ReturnType<typeof fakeNetwork>;
  const deps = (now: number) => ({ config, store, fetch: net.fetch, now });

  beforeEach(async () => {
    store = memoryStore();
    net = fakeNetwork();
    await saveWatch(deps(minutes(-60)), {
      events: ['cpi', 'fomc', 'cpi'],
      remindMinutes: 15,
      results: true,
    });
  });

  it('schedules the watched releases within the next 60 days', () => {
    expect([...store.releases.keys()].sort()).toEqual([
      'cpi|2026-11-12',
      'cpi|2026-12-10',
      'fomc|2026-12-09',
    ]);
    expect(store.releases.get('fomc|2026-12-09')?.at).toBe(Date.parse('2026-12-09T19:00:00Z'));
  });

  it('sends one reminder before each release', async () => {
    expect(await runEconomic(deps(minutes(-16)))).toMatchObject({ reminded: 0 });
    expect(await runEconomic(deps(minutes(-15)))).toMatchObject({ reminded: 1 });
    expect(await runEconomic(deps(minutes(-14)))).toMatchObject({ reminded: 0 });

    const [reminder] = [...store.notifications.values()];
    expect(reminder?.event).toMatchObject({
      topic: 'release',
      title: '13:30: Consumer prices (CPI)',
      body: 'Due in 15 minutes. Published by the US Bureau of Labor Statistics.',
    });
    expect(net.state.whatsapp).toEqual([
      { name: 'meeting_reminder', params: ['US CPI release', '13:30'] },
    ]);
  });

  it('posts the figures once FRED has them, and only once', async () => {
    expect(await runEconomic(deps(minutes(5)))).toMatchObject({ published: 0 });
    net.state.cpiUpdated = '2026-11-12 07:41:02-06';
    expect(await runEconomic(deps(minutes(12)))).toMatchObject({ published: 1 });
    expect(await runEconomic(deps(minutes(13)))).toMatchObject({ published: 0 });

    const posted = [...store.notifications.values()].find((n) =>
      n.event.title.endsWith('published'),
    );
    expect(posted?.event.title).toBe('US CPI for October 2026: published');
    expect(posted?.event.body).toBe(
      'All items, on the month: +0.3% (previously +0.2%). All items, on the year: 2.9% (previously 3.0%). ' +
        'Excluding food and energy, on the year: 3.0%. Source: US Bureau of Labor Statistics, via FRED.',
    );
    expect(net.state.whatsapp.at(-1)).toEqual({
      name: 'release_update',
      params: ['US CPI for October 2026', 'm/m +0.3%, y/y 2.9%, core y/y 3.0%'],
    });
    const [first] = await upcomingReleases(deps(minutes(13)), {
      events: ['cpi'],
      remindMinutes: 15,
      results: true,
    });
    expect(first).toMatchObject({ key: 'cpi|2026-11-12', status: 'published' });
  });

  it('sends a summary of tomorrow once, at the chosen time', async () => {
    const watch = {
      events: ['cpi' as const],
      remindMinutes: 30,
      results: true,
      summaryAt: '18:00',
    };
    const evening = (time: string) => deps(Date.parse(`2026-11-11T${time}:00Z`));
    expect(await sendSummary(evening('17:59'), watch)).toBe(false);
    expect(await sendSummary(evening('18:00'), watch)).toBe(true);
    expect(await sendSummary(evening('18:01'), watch)).toBe(false);

    const [summary] = [...store.notifications.values()];
    expect(summary?.event).toMatchObject({
      topic: 'release',
      title: 'Tomorrow, Thursday 12 November: 1 US release',
      body: '13:30 Consumer prices (CPI).',
    });
    expect(net.state.whatsapp).toEqual([
      { name: 'release_update', params: ["tomorrow's US releases", '13:30 US CPI'] },
    ]);
    // Nothing watched is due the day after, so that evening stays quiet.
    expect(await sendSummary(deps(Date.parse('2026-11-12T18:00:00Z')), watch)).toBe(false);
  });

  it('stops looking six hours after a release', async () => {
    await runEconomic(deps(minutes(6 * 60 + 1)));
    expect(store.releases.get('cpi|2026-11-12')?.missedAt).not.toBeNull();
    expect([...store.notifications.values()]).toHaveLength(0);
  });

  it('reads the Fed decision from its statement', async () => {
    const row = store.releases.get('fomc|2026-12-09')!;
    expect(await fetchResult(deps(row.at + 60_000), row)).toBeNull();
    net.state.statementPublished = true;
    expect(await fetchResult(deps(row.at + 60_000), row)).toEqual({
      period: '',
      body: 'The target range for the federal funds rate was lowered by 0.25 percentage points, to 3.50% to 3.75%.',
      short: 'target range lowered by 0.25 percentage points, to 3.50% to 3.75%',
    });
  });

  it('schedules only the Fed decision without a FRED key', async () => {
    const without = memoryStore();
    await saveWatch(
      { config: baseConfig, store: without, fetch: net.fetch, now: minutes(-60) },
      { events: ['cpi', 'fomc'], remindMinutes: 15, results: true },
    );
    expect([...without.releases.keys()]).toEqual(['fomc|2026-12-09']);
  });
});

describe('the economic API', () => {
  it('saves a watch, routes its alerts and shows what is coming', async () => {
    const store = memoryStore();
    const net = fakeNetwork();
    const set = await startSession(store, 'owner@example.com', Date.now());
    const cookies = set.map((c) => c.split(';')[0]).join('; ');
    const csrf = set[1]!.split(';')[0]!.split('=')[1]!;
    const call = (method: string, path: string, body?: unknown) => {
      const request = new Request(`https://api.example.com${path}`, {
        method,
        headers: {
          Cookie: cookies,
          'X-Requested-With': 'twindesk',
          'X-CSRF-Token': csrf,
          Origin: APP,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return handleApi(request, new URL(request.url), { config, store, fetch: net.fetch });
    };

    const saved = await call('PUT', '/v1/economic/watch', {
      watch: { events: ['cpi'], remindMinutes: 30, results: true },
      channels: ['email'],
    });
    expect(saved.status).toBe(200);
    const state = (await saved.json()) as EconomicState;
    expect(state).toMatchObject({
      claude: false,
      fred: true,
      watch: { events: ['cpi'], remindMinutes: 30, results: true },
      channels: ['in-app', 'email'],
    });
    expect((await loadPreferences(store)).routing.release).toEqual(['in-app', 'email']);

    const invalid = await call('PUT', '/v1/economic/watch', {
      watch: { events: ['cpi'], remindMinutes: 0, results: false },
    });
    expect(invalid.status).toBe(422);

    const stopped = (await (await call('DELETE', '/v1/economic/watch')).json()) as EconomicState;
    expect(stopped).toMatchObject({ watch: null, upcoming: [] });

    const instruction = await call('POST', '/v1/instructions', { text: 'Watch CPI' });
    expect(instruction.status).toBe(409);
  });
});

describe('figures straight from BLS', () => {
  const row = {
    key: 'cpi|2026-11-12',
    event: 'cpi' as const,
    releaseDate: '2026-11-12',
    at: CPI_AT,
    remindedAt: null,
    resultAt: null,
    missedAt: null,
    details: null,
  };
  const point = (year: number, month: number, value: number) => ({
    year: String(year),
    period: `M${String(month).padStart(2, '0')}`,
    value: String(value),
  });

  function fakeBls(latestMonth: number) {
    const calls: unknown[] = [];
    const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.bls.gov/publicAPI/v2/timeseries/data/');
      calls.push(JSON.parse(String(init?.body)));
      const sa = [
        point(2026, latestMonth, 337.476),
        point(2026, latestMonth - 1, 336.298),
        point(2026, latestMonth - 2, 335),
      ];
      const nsa = [
        point(2026, latestMonth, 337.511),
        { year: '2025', period: 'M13', value: '330' },
        point(2026, latestMonth - 1, 336.9),
        point(2025, latestMonth, 328),
        point(2025, latestMonth - 1, 327.5),
      ];
      return Response.json({
        status: 'REQUEST_SUCCEEDED',
        Results: {
          series: [
            { seriesID: 'CUSR0000SA0', data: sa },
            { seriesID: 'CUUR0000SA0', data: nsa },
          ],
        },
      });
    }) as typeof fetch;
    return { calls, fetch: fakeFetch };
  }

  it('works out the changes from the published indexes, as BLS does', async () => {
    const bls = fakeBls(10);
    const config = { ...baseConfig, BLS_API_KEY: 'b'.repeat(32) };
    const result = await fetchResult(
      { config, store: memoryStore(), fetch: bls.fetch, now: CPI_AT + 60_000 },
      row,
    );
    expect(result).toEqual({
      period: 'October 2026',
      body: 'All items, on the month: +0.4% (previously +0.4%). All items, on the year: 2.9% (previously 2.9%).',
      short: 'm/m +0.4%, y/y 2.9%',
    });
    expect(bls.calls[0]).toMatchObject({
      startyear: '2024',
      endyear: '2026',
      registrationkey: 'b'.repeat(32),
    });
  });

  it('waits while BLS still shows the month before', async () => {
    const bls = fakeBls(9);
    const config = { ...baseConfig, BLS_API_KEY: 'b'.repeat(32) };
    expect(
      await fetchResult(
        { config, store: memoryStore(), fetch: bls.fetch, now: CPI_AT + 60_000 },
        row,
      ),
    ).toBeNull();
  });
});
