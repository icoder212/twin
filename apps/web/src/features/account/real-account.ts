import { create } from 'zustand';
import {
  accountStatusSchema,
  ApiError,
  createHttpApi,
  createHttpClient,
  isApiError,
  type AccountStatus,
  type AlertsApi,
  type BriefingsApi,
  type HttpClient,
  type NotificationsApi,
  type RequestOptions,
  type TwinDeskApi,
} from '@twindesk/core';
import { registerSessionReset } from '@/features/auth/session-store';

/**
 * Demo builds only: the owner's real account on the Desk Twin server, next to the demo logins.
 * The server is reached at /v1 on the app's own domain (proxied), so its cookies are first-party
 * and the page's Content Security Policy needs no new origin. Signing in with Google switches the
 * notification screens and the bell to real data; everything else stays demo.
 */

type Availability = 'unknown' | 'unavailable' | 'available';

interface RealAccountState {
  /** Whether this deployment has the server behind /v1 at all. */
  availability: Availability;
  status: AccountStatus;
}

export const useRealAccount = create<RealAccountState>()(() => ({
  availability: 'unknown',
  status: { signedIn: false },
}));

const HEADERS = { Accept: 'application/json', 'X-Requested-With': 'twindesk' };

function readCookie(name: string): string | null {
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

/** Asks the server who is signed in. Without a server, /v1 serves the app's HTML instead. */
export async function refreshRealAccount(): Promise<void> {
  try {
    const response = await fetch('/v1/account', {
      credentials: 'same-origin',
      headers: HEADERS,
      cache: 'no-store',
    });
    const isJson = (response.headers.get('Content-Type') ?? '').includes('application/json');
    const parsed =
      response.ok && isJson ? accountStatusSchema.safeParse(await response.json()) : null;
    if (!parsed?.success) {
      useRealAccount.setState({ availability: 'unavailable', status: { signedIn: false } });
      return;
    }
    useRealAccount.setState({ availability: 'available', status: parsed.data });
  } catch {
    useRealAccount.setState({ availability: 'unavailable', status: { signedIn: false } });
  }
}

/** Full-page sign-in through the server, which returns to `returnTo` on this site. */
export function realSignInUrl(returnTo = '/notifications'): string {
  const params = new URLSearchParams({ origin: window.location.origin, return: returnTo });
  return `/v1/auth/google/start?${params.toString()}`;
}

export async function signOutRealAccount(): Promise<void> {
  if (!useRealAccount.getState().status.signedIn) return;
  useRealAccount.setState({ status: { signedIn: false } });
  await fetch('/v1/account/sign-out', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { ...HEADERS, 'X-CSRF-Token': readCookie('twindesk_csrf') ?? '' },
  }).catch(() => undefined);
}

// Leaving the demo also leaves the real account, so the next person on this browser sees neither.
registerSessionReset(() => void signOutRealAccount());

const isReal = () => useRealAccount.getState().status.signedIn;

let real: TwinDeskApi | null = null;
function realApi(): TwinDeskApi {
  real ??= createHttpApi({
    baseUrl: window.location.origin,
    getCsrfToken: () => readCookie('twindesk_csrf'),
  });
  return real;
}

/**
 * An ended Google session must not look like the demo session ending, which would sign the
 * user out of the whole app, so it becomes a plain error and the screens fall back to the demo.
 */
async function guarded<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (isApiError(error) && error.code === 'unauthenticated') {
      useRealAccount.setState({ status: { signedIn: false } });
      throw new ApiError(
        'conflict',
        'Your Google sign-in has ended. Sign in again on the Notifications page.',
        { status: 409 },
      );
    }
    throw error;
  }
}

let client: HttpClient | null = null;

/** A call for screens that exist only with the real account, such as instructions. */
export function realRequest<T>(path: string, opts: RequestOptions<T>): Promise<T> {
  client ??= createHttpClient({
    baseUrl: window.location.origin,
    getCsrfToken: () => readCookie('twindesk_csrf'),
  });
  const http = client;
  return guarded(() => http.request(path, opts));
}

/**
 * The demo API, with notifications and briefings served by the real server while the owner is
 * signed in.
 */
export function withRealNotifications<T extends TwinDeskApi>(mock: T): T {
  const notifications: NotificationsApi = {
    preferences: () =>
      isReal()
        ? guarded(() => realApi().notifications.preferences())
        : mock.notifications.preferences(),
    updatePreferences: (input) =>
      isReal()
        ? guarded(() => realApi().notifications.updatePreferences(input))
        : mock.notifications.updatePreferences(input),
    contacts: () =>
      isReal() ? guarded(() => realApi().notifications.contacts()) : mock.notifications.contacts(),
    startVerification: (input) =>
      isReal()
        ? guarded(() => realApi().notifications.startVerification(input))
        : mock.notifications.startVerification(input),
    confirmVerification: (input) =>
      isReal()
        ? guarded(() => realApi().notifications.confirmVerification(input))
        : mock.notifications.confirmVerification(input),
    removeContact: (channel) =>
      isReal()
        ? guarded(() => realApi().notifications.removeContact(channel))
        : mock.notifications.removeContact(channel),
    policy: () =>
      isReal() ? guarded(() => realApi().notifications.policy()) : mock.notifications.policy(),
    updatePolicy: (input) =>
      isReal()
        ? guarded(() => realApi().notifications.updatePolicy(input))
        : mock.notifications.updatePolicy(input),
    events: () =>
      isReal() ? guarded(() => realApi().notifications.events()) : mock.notifications.events(),
    acknowledge: (id) =>
      isReal()
        ? guarded(() => realApi().notifications.acknowledge(id))
        : mock.notifications.acknowledge(id),
    sendTest: (urgency) =>
      isReal()
        ? guarded(() => realApi().notifications.sendTest(urgency))
        : mock.notifications.sendTest(urgency),
  };
  const alerts: AlertsApi = {
    ...mock.alerts,
    notifications: () =>
      isReal() ? guarded(() => realApi().alerts.notifications()) : mock.alerts.notifications(),
    markRead: (ids) =>
      isReal() ? guarded(() => realApi().alerts.markRead(ids)) : mock.alerts.markRead(ids),
  };
  const briefings: BriefingsApi = {
    list: () => (isReal() ? guarded(() => realApi().briefings.list()) : mock.briefings.list()),
    update: (input) =>
      isReal() ? guarded(() => realApi().briefings.update(input)) : mock.briefings.update(input),
    preview: (kind) =>
      isReal() ? guarded(() => realApi().briefings.preview(kind)) : mock.briefings.preview(kind),
    sendNow: (kind) =>
      isReal() ? guarded(() => realApi().briefings.sendNow(kind)) : mock.briefings.sendNow(kind),
  };
  return { ...mock, notifications, alerts, briefings };
}
