import { z } from 'zod';
import { create } from 'zustand';
import {
  ApiError,
  GOOGLE_CALENDAR_SCOPE,
  GoogleCalendarError,
  listGoogleEvents,
  type CalendarConnection,
  type CalendarFeed,
  type CalendarUpcoming,
} from '@twindesk/core';
import { registerSessionReset } from '@/features/auth/session-store';

/**
 * Demo builds only: the browser holds short-lived, read-only Google Calendar access so a demo can
 * show a real calendar without a backend. Production reads calendars on the server with tokens
 * in its vault; this module is never used there.
 *
 * Google documents this browser-only grant as a legacy option. It is acceptable here because the
 * access is read-only, ends within an hour, lives in memory only and is wiped on sign-out.
 */

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const CHANNEL = 'twindesk-google-oauth';
const SIGN_IN_TIMEOUT_MS = 5 * 60_000;
const CACHE_MS = 60_000;
/** Treat access as ended a little early, so a request never races the expiry. */
const EXPIRY_MARGIN_MS = 30_000;

interface GoogleAccessState {
  /** Memory only: never written to Web Storage, gone on reload and on sign-out. */
  token: { value: string; expiresAt: number } | null;
  /** Set when Google refused the token, so the UI says "connect again" rather than "connect". */
  refused: boolean;
  grant(value: string, expiresAt: number): void;
  refuse(): void;
  clear(): void;
}

const useGoogleAccess = create<GoogleAccessState>()((set) => ({
  token: null,
  refused: false,
  grant: (value, expiresAt) => set({ token: { value, expiresAt }, refused: false }),
  refuse: () => set({ token: null, refused: true }),
  clear: () => set({ token: null, refused: false }),
}));

const cache = new Map<number, { at: number; value: CalendarUpcoming }>();

registerSessionReset(() => {
  useGoogleAccess.getState().clear();
  cache.clear();
});

const replySchema = z.object({
  type: z.literal('google-oauth'),
  state: z.string().max(128),
  accessToken: z.string().max(4096),
  expiresIn: z.number().int().min(0).max(86_400),
  scope: z.string().max(2048),
  error: z.string().max(128),
});

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const signInError = (message: string) => new ApiError('conflict', message, { status: 409 });

/**
 * Opens Google's consent screen in a pop-up and resolves once read-only access is granted. Call
 * it directly from a click handler, or the browser blocks the pop-up.
 */
export function connectGoogleCalendar(clientId: string): Promise<void> {
  const pending = signIn(clientId);
  // The caller awaits this a moment later (inside a mutation); avoid an unhandled-rejection
  // report in between. The original promise still rejects for whoever awaits it.
  pending.catch(() => undefined);
  return pending;
}

function signIn(clientId: string): Promise<void> {
  const state = randomState();
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${window.location.origin}/oauth/google.html`,
    response_type: 'token',
    scope: GOOGLE_CALENDAR_SCOPE,
    state,
    include_granted_scopes: 'false',
  }).toString();

  let channel: BroadcastChannel;
  try {
    channel = new BroadcastChannel(CHANNEL);
  } catch {
    return Promise.reject(signInError('This browser cannot finish Google sign-in here.'));
  }
  const popup = window.open(url.toString(), 'twindesk-google', 'popup,width=520,height=680');
  if (!popup) {
    channel.close();
    return Promise.reject(
      signInError(
        'Your browser blocked the Google window. Allow pop-ups for this site, then try again.',
      ),
    );
  }

  return new Promise<void>((resolve, reject) => {
    const finish = (error?: ApiError) => {
      window.clearTimeout(timer);
      channel.close();
      if (error) reject(error);
      else resolve();
    };
    const timer = window.setTimeout(
      () => finish(signInError('Google sign-in did not finish. Try again.')),
      SIGN_IN_TIMEOUT_MS,
    );
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const reply = replySchema.safeParse(event.data);
      // Ignore anything that is not the answer to this exact request.
      if (!reply.success || reply.data.state !== state) return;
      const { accessToken, expiresIn, scope, error } = reply.data;
      if (error || !accessToken || !expiresIn) {
        finish(
          signInError(
            error === 'access_denied'
              ? 'Google sign-in was cancelled.'
              : 'Google sign-in did not finish. Try again.',
          ),
        );
        return;
      }
      if (!scope.split(' ').includes(GOOGLE_CALENDAR_SCOPE)) {
        finish(
          signInError(
            'Calendar access was not allowed. Connect again and tick the box to see your calendar events.',
          ),
        );
        return;
      }
      useGoogleAccess.getState().grant(accessToken, Date.now() + expiresIn * 1000);
      cache.clear();
      finish();
    };
  });
}

function connection(): CalendarConnection {
  const { token, refused } = useGoogleAccess.getState();
  if (token && Date.now() < token.expiresAt - EXPIRY_MARGIN_MS) return 'connected';
  return token || refused ? 'expired' : 'not-connected';
}

/** The live calendar the demo backend reads. Results are cached for a minute per range. */
export function createGoogleCalendarFeed(): CalendarFeed {
  return {
    connection,
    async upcoming(days, { fresh = false } = {}) {
      const state = connection();
      const token = useGoogleAccess.getState().token;
      if (state !== 'connected' || !token) return { connection: state, events: [] };
      const hit = cache.get(days);
      if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.value;

      const from = new Date();
      try {
        const { calendarName, events } = await listGoogleEvents({
          accessToken: token.value,
          from,
          to: new Date(from.getTime() + days * 86_400_000),
        });
        const value: CalendarUpcoming = {
          connection: 'connected',
          calendarName,
          fetchedAt: new Date().toISOString(),
          accessEndsAt: new Date(token.expiresAt).toISOString(),
          events,
        };
        cache.set(days, { at: Date.now(), value });
        return value;
      } catch (error) {
        if (error instanceof GoogleCalendarError && error.reason === 'expired') {
          useGoogleAccess.getState().refuse();
          cache.clear();
          return { connection: 'expired', events: [] };
        }
        throw new ApiError(
          'server',
          error instanceof Error ? error.message : 'Google Calendar did not respond.',
          { status: 502 },
        );
      }
    },
    disconnect() {
      useGoogleAccess.getState().clear();
      cache.clear();
    },
  };
}
