import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GOOGLE_CALENDAR_SCOPE } from '@twindesk/core';
import { runSessionResets } from '@/features/auth/session-store';
import { connectGoogleCalendar, createGoogleCalendarFeed } from './google-access';

/** In-memory stand-in for BroadcastChannel: delivers to every other open channel of that name. */
class FakeChannel {
  static open = new Set<FakeChannel>();
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  constructor(readonly name: string) {
    FakeChannel.open.add(this);
  }
  postMessage(data: unknown) {
    for (const c of FakeChannel.open) {
      if (c !== this && c.name === this.name) c.onmessage?.({ data } as MessageEvent<unknown>);
    }
  }
  close() {
    FakeChannel.open.delete(this);
  }
}

const CLIENT_ID = '123-abc.apps.googleusercontent.com';
let openedUrl = '';

/** What the sign-in window's script sends back, defaulting to a good grant for this request. */
function reply(overrides: Record<string, unknown> = {}) {
  const sender = new FakeChannel('twindesk-google-oauth');
  sender.postMessage({
    type: 'google-oauth',
    state: new URL(openedUrl).searchParams.get('state'),
    accessToken: 'secret-token',
    expiresIn: 3600,
    scope: GOOGLE_CALENDAR_SCOPE,
    error: '',
    ...overrides,
  });
  sender.close();
}

describe('Google Calendar access in the browser', () => {
  beforeEach(() => {
    vi.stubGlobal('BroadcastChannel', FakeChannel);
    vi.spyOn(window, 'open').mockImplementation((url) => {
      openedUrl = String(url);
      return {} as Window;
    });
  });

  afterEach(() => {
    runSessionResets();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('asks only for read-only calendar access and keeps the token in memory', async () => {
    const feed = createGoogleCalendarFeed();
    const pending = connectGoogleCalendar(CLIENT_ID);
    const params = new URL(openedUrl).searchParams;
    expect(params.get('response_type')).toBe('token');
    expect(params.get('scope')).toBe(GOOGLE_CALENDAR_SCOPE);
    expect(params.get('redirect_uri')).toBe(`${window.location.origin}/oauth/google.html`);

    reply({ state: 'someone-elses-request' });
    expect(feed.connection()).toBe('not-connected');

    reply();
    await pending;
    expect(feed.connection()).toBe('connected');
    const stored = JSON.stringify({ ...window.localStorage, ...window.sessionStorage });
    expect(stored).not.toContain('secret-token');

    runSessionResets();
    expect(feed.connection()).toBe('not-connected');
  });

  it('refuses a grant without calendar access', async () => {
    const pending = connectGoogleCalendar(CLIENT_ID);
    reply({ scope: 'openid' });
    await expect(pending).rejects.toThrow('Calendar access was not allowed');
  });

  it('explains a blocked pop-up', async () => {
    vi.mocked(window.open).mockReturnValue(null);
    await expect(connectGoogleCalendar(CLIENT_ID)).rejects.toThrow('blocked the Google window');
  });

  it('marks access as ended when Google refuses the token', async () => {
    const feed = createGoogleCalendarFeed();
    const pending = connectGoogleCalendar(CLIENT_ID);
    reply();
    await pending;
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 401 }));
    const result = await feed.upcoming(7);
    expect(result.connection).toBe('expired');
    expect(feed.connection()).toBe('expired');
  });
});
