import { beforeEach, describe, expect, it } from 'vitest';
import { allPassed } from '../compliance/advice-checks';
import { fromGoogleEvent, GoogleCalendarError, listGoogleEvents } from '../calendar/google';
import type { CalendarConnection, CalendarEvent, CalendarFeed } from '../domain/calendar';
import type { TwinAnswer, TwinStreamEvent } from '../domain/twin';
import { dayKeyIn } from '../format/format';
import { createMockApi } from '../mock/mock-api';
import { DEMO_MFA_CODE, DEMO_PASSWORD } from '../mock/users';
import { createMemoryStore } from '../storage/kv';
import { getTenantPreset } from '../tenants/presets';

const tenant = getTenantPreset('alchmai');

describe('Google Calendar mapping', () => {
  const base = {
    id: 'abc123',
    summary: 'Coach call',
    start: { dateTime: '2026-11-09T10:00:00+01:00' },
    end: { dateTime: '2026-11-09T10:30:00+01:00' },
  };

  it('keeps only what the desk needs', () => {
    const event = fromGoogleEvent({
      ...base,
      location: 'Room 2',
      hangoutLink: 'https://meet.google.com/abc-defg-hij',
      htmlLink: 'https://www.google.com/calendar/event?eid=abc',
      attendees: [{ self: true, responseStatus: 'accepted' }, {}, {}, { resource: true }],
    });
    expect(event).toEqual({
      id: 'abc123',
      title: 'Coach call',
      start: '2026-11-09T09:00:00.000Z',
      end: '2026-11-09T09:30:00.000Z',
      allDay: false,
      location: 'Room 2',
      joinUrl: 'https://meet.google.com/abc-defg-hij',
      link: 'https://www.google.com/calendar/event?eid=abc',
      tentative: false,
      guests: 2,
    });
  });

  it('leaves out cancelled, declined and working-location entries', () => {
    expect(fromGoogleEvent({ ...base, status: 'cancelled' })).toBeNull();
    expect(fromGoogleEvent({ ...base, eventType: 'workingLocation' })).toBeNull();
    expect(
      fromGoogleEvent({ ...base, attendees: [{ self: true, responseStatus: 'declined' }] }),
    ).toBeNull();
  });

  it('anchors all-day events at midday UTC and drops unsafe links', () => {
    const event = fromGoogleEvent({
      ...base,
      summary: 'Bank holiday\u202E',
      start: { date: '2026-12-25' },
      end: { date: '2026-12-26' },
      hangoutLink: 'javascript:alert(1)',
      htmlLink: 'https://evil.example/calendar',
    });
    expect(event?.allDay).toBe(true);
    expect(event?.start).toBe('2026-12-25T12:00:00.000Z');
    expect(event?.title).toBe('Bank holiday');
    expect(event?.joinUrl).toBeUndefined();
    expect(event?.link).toBeUndefined();
  });

  it('asks Google for read-only fields with a bearer token', async () => {
    let seen: { url: string; auth: string | null } | undefined;
    const fetch = (async (url: string, init?: RequestInit) => {
      seen = { url, auth: new Headers(init?.headers).get('Authorization') };
      return new Response(JSON.stringify({ summary: 'hello@example.com', items: [base, {}] }));
    }) as typeof globalThis.fetch;
    const result = await listGoogleEvents({
      accessToken: 'tok',
      from: new Date('2026-11-09T00:00:00Z'),
      to: new Date('2026-11-16T00:00:00Z'),
      fetch,
    });
    expect(seen?.auth).toBe('Bearer tok');
    expect(seen?.url).toContain('calendars/primary/events');
    expect(seen?.url).toContain('singleEvents=true');
    expect(decodeURIComponent(seen?.url ?? '')).not.toContain('email');
    expect(result.calendarName).toBe('hello@example.com');
    expect(result.events).toHaveLength(1);
  });

  it('reports a refused token as expired access', async () => {
    const fetch = (async () => new Response('{}', { status: 401 })) as typeof globalThis.fetch;
    const error = await listGoogleEvents({
      accessToken: 'x',
      from: new Date(),
      to: new Date(),
      fetch,
    })
      .then(() => null)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GoogleCalendarError);
    expect((error as GoogleCalendarError).reason).toBe('expired');
  });
});

describe('dayKeyIn', () => {
  it('counts days on the local wall clock across a clock change', () => {
    // The UK clocks went back at 02:00 on 25 October 2026, so that day had 25 hours.
    expect(dayKeyIn('Europe/London', '2026-10-24T23:30:00Z')).toBe('2026-10-25');
    expect(dayKeyIn('Europe/London', '2026-10-24T23:30:00Z', 1)).toBe('2026-10-26');
    expect(dayKeyIn('America/New_York', '2026-11-09T03:00:00Z')).toBe('2026-11-08');
  });
});

// ---------------------------------------------------------------------------
// The demo backend with a live calendar
// ---------------------------------------------------------------------------

class FakeFeed implements CalendarFeed {
  state: CalendarConnection = 'not-connected';
  events: CalendarEvent[] = [];
  calls = 0;
  connection() {
    return this.state;
  }
  async upcoming() {
    this.calls += 1;
    if (this.state !== 'connected') return { connection: this.state, events: [] };
    return {
      connection: this.state,
      calendarName: 'hello@example.com',
      fetchedAt: new Date().toISOString(),
      events: this.events,
    };
  }
  disconnect() {
    this.state = 'not-connected';
  }
}

const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

async function answerTo(api: ReturnType<typeof createMockApi>, question: string) {
  let answer: TwinAnswer | undefined;
  for await (const e of api.twin.ask({
    conversationId: 'c1',
    question,
  }) as AsyncIterable<TwinStreamEvent>) {
    if (e.type === 'done') answer = e.answer;
  }
  if (!answer) throw new Error('no answer');
  return answer;
}

describe('mock API with a live calendar', () => {
  let feed: FakeFeed;
  let api: ReturnType<typeof createMockApi>;

  beforeEach(async () => {
    feed = new FakeFeed();
    api = createMockApi({ tenant, store: createMemoryStore(), speed: 0, calendar: feed });
    const result = await api.auth.login({
      email: 'alex.morgan@demo.alchmai.com',
      password: DEMO_PASSWORD,
    });
    if (result.status !== 'mfa-required') throw new Error('expected MFA');
    await api.auth.verifyMfa({ challengeId: result.challengeId, code: DEMO_MFA_CODE });
  });

  const google = async () => (await api.sources.list()).find((s) => s.id === 'src_google');

  it('mirrors the browser’s Google access on the Google source', async () => {
    expect((await google())?.status).toBe('not-connected');
    await expect(
      api.sources.connect({ sourceId: 'src_google', label: 'Google', confirmReadOnly: true }),
    ).rejects.toThrow('Finish signing in with Google first.');

    feed.state = 'connected';
    feed.events = [
      {
        id: 'e1',
        title: 'Coach call',
        start: inMinutes(60),
        end: inMinutes(90),
        allDay: false,
        tentative: false,
        guests: 1,
      },
    ];
    const connected = await api.sources.connect({
      sourceId: 'src_google',
      label: 'Google',
      confirmReadOnly: true,
    });
    expect(connected.status).toBe('connected');
    expect(connected.scopes).toEqual(['Calendar events (read-only)']);
    expect(connected.recordCount).toBe(1);

    feed.state = 'expired';
    expect((await google())?.status).toBe('error');

    await api.sources.revoke('src_google');
    expect((await google())?.status).toBe('not-connected');
  });

  it('adds one in-app reminder for a meeting starting within 10 minutes', async () => {
    feed.state = 'connected';
    feed.events = [
      {
        id: 'soon',
        title: 'Coach call',
        start: inMinutes(8),
        end: inMinutes(38),
        allDay: false,
        tentative: false,
        guests: 1,
      },
      {
        id: 'later',
        title: 'Review',
        start: inMinutes(45),
        end: inMinutes(60),
        allDay: false,
        tentative: false,
        guests: 0,
      },
    ];
    const first = await api.alerts.notifications();
    const second = await api.alerts.notifications();
    const reminders = second.filter((n) => n.id.startsWith('nt_cal_'));
    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.title).toContain('Coach call');
    expect(first.filter((n) => n.id.startsWith('nt_cal_'))).toHaveLength(1);
  });

  it('answers calendar questions from the live calendar, with a citation', async () => {
    feed.state = 'connected';
    feed.events = [
      {
        id: 'e1',
        title: 'Buy the dip review',
        start: inMinutes(30),
        end: inMinutes(60),
        allDay: false,
        tentative: false,
        guests: 2,
      },
    ];
    const answer = await answerTo(api, 'When is my next meeting?');
    expect(answer.status).toBe('answered');
    expect(allPassed(answer.checks)).toBe(true);
    expect(answer.citations[0]?.kind).toBe('calendar');
    expect(answer.text).not.toContain('Buy the dip');
    expect(JSON.stringify(answer.blocks)).toContain('Buy the dip review');
  });

  it('says so when the calendar is not connected, and only reads it for calendar questions', async () => {
    const answer = await answerTo(api, 'What’s on my calendar today?');
    expect(answer.status).toBe('not-covered');
    expect(answer.text).toContain('isn’t connected');

    feed.state = 'connected';
    const before = feed.calls;
    await answerTo(api, 'How close am I to my daily limit?');
    expect(feed.calls).toBe(before);
  });
});
