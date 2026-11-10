import { randomToken, sha256Hex, timingSafeEqual } from './crypto';
import { cookie } from './http';
import type { Store } from './store';

/** HttpOnly, host-only and https-only (the __Host- prefix makes the browser enforce it). */
const SESSION_COOKIE = '__Host-dt_session';
/** Readable by the app, which echoes it in X-CSRF-Token (double submit). */
const CSRF_COOKIE = 'twindesk_csrf';
const SESSION_SECONDS = 12 * 3600;

export interface SessionInfo {
  email: string;
  csrf: string;
}

/** Creates a session and returns the cookies that carry it. Only a hash of the token is stored. */
export async function startSession(store: Store, email: string, now: number): Promise<string[]> {
  const token = randomToken(32);
  const csrf = randomToken(24);
  await store.createSession(await sha256Hex(token), email, csrf, now, now + SESSION_SECONDS * 1000);
  return [
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_SECONDS}`,
    `${CSRF_COOKIE}=${csrf}; Path=/; Secure; SameSite=Lax; Max-Age=${SESSION_SECONDS}`,
  ];
}

export async function readSession(
  store: Store,
  request: Request,
  now: number,
): Promise<SessionInfo | null> {
  const token = cookie(request, SESSION_COOKIE);
  if (!token || token.length > 128) return null;
  return store.getSession(await sha256Hex(token), now);
}

/** Deletes the session and returns cookies that clear it in the browser. */
export async function endSession(store: Store, request: Request): Promise<string[]> {
  const token = cookie(request, SESSION_COOKIE);
  if (token && token.length <= 128) await store.deleteSession(await sha256Hex(token));
  return [
    `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    `${CSRF_COOKIE}=; Path=/; Secure; SameSite=Lax; Max-Age=0`,
  ];
}

/**
 * Changes must come from the app itself: the CSRF token from its cookie, the header the app's
 * HTTP client always sends, and, when the browser states one, an allowed origin.
 */
export function sameAppRequest(request: Request, session: SessionInfo, origins: string[]): boolean {
  const origin = request.headers.get('Origin');
  if (origin && !origins.includes(origin)) return false;
  if (request.headers.get('X-Requested-With') !== 'twindesk') return false;
  return timingSafeEqual(request.headers.get('X-CSRF-Token') ?? '', session.csrf);
}
