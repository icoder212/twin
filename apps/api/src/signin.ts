import { GOOGLE_CALENDAR_SCOPE } from '@twindesk/core';
import type { Config } from './config';
import { pkceChallenge, randomToken, seal, timingSafeEqual, unseal } from './crypto';
import { exchangeCode, googleAuthUrl, idTokenEmail } from './google';
import { cookie, redirect, text } from './http';
import { log } from './log';
import type { Store } from './store';

const NONCE_COOKIE = 'dt_signin';
const SIGN_IN_TTL_MS = 10 * 60_000;

interface SignInState {
  /** PKCE verifier. */
  v: string;
  /** Matches the browser's nonce cookie, so a sign-in link cannot be finished elsewhere. */
  n: string;
  exp: number;
  /** The site the owner signed in from, and where to return to on it. */
  o: string;
  r: string;
}

export interface SignInPlace {
  /** Origin the browser sees, e.g. https://twin.alchmai.com (where /v1 is proxied here). */
  origin: string;
  callbackPath: string;
  returnTo: string;
  cookiePath: string;
}

const clearNonce = (path: string) => `${NONCE_COOKIE}=; Path=${path}; Max-Age=0`;

/** Starts Google sign-in. The state is sealed, so nobody can read the PKCE verifier. */
export async function beginGoogle(config: Config, place: SignInPlace): Promise<Response> {
  const verifier = randomToken(48);
  const nonce = randomToken(16);
  const state: SignInState = {
    v: verifier,
    n: nonce,
    exp: Date.now() + SIGN_IN_TTL_MS,
    o: place.origin,
    r: place.returnTo,
  };
  return redirect(
    googleAuthUrl(
      config,
      `${place.origin}${place.callbackPath}`,
      await seal(JSON.stringify(state), config.TOKEN_KEY),
      await pkceChallenge(verifier),
    ),
    {
      'Set-Cookie': `${NONCE_COOKIE}=${nonce}; Path=${place.cookiePath}; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  );
}

export type GoogleOutcome =
  | { ok: true; origin: string; returnTo: string; clearCookie: string }
  | { ok: false; response: Response };

/**
 * Finishes Google sign-in: checks the state and the browser, exchanges the code, accepts only
 * the owner's account with calendar access, and stores lasting access sealed with TOKEN_KEY.
 */
export async function completeGoogle(
  config: Config,
  store: Store,
  url: URL,
  request: Request,
  callbackPath: string,
  cookiePath: string,
  fetchFn: typeof fetch,
): Promise<GoogleOutcome> {
  const clear = { 'Set-Cookie': clearNonce(cookiePath) };
  const fail = (message: string, status = 400): GoogleOutcome => ({
    ok: false,
    response: text(message, status, clear),
  });
  if (url.searchParams.get('error'))
    return fail('Google sign-in was cancelled. You can close this window.');

  const code = url.searchParams.get('code');
  const sealed = url.searchParams.get('state');
  const nonce = cookie(request, NONCE_COOKIE);
  const expired =
    'This sign-in has expired or was opened in another browser. Go back and start again.';
  if (!code || !sealed || !nonce) return fail(expired);

  let state: Partial<SignInState>;
  try {
    state = JSON.parse(await unseal(sealed, config.TOKEN_KEY)) as Partial<SignInState>;
  } catch {
    return fail(expired);
  }
  if (
    typeof state.v !== 'string' ||
    typeof state.n !== 'string' ||
    typeof state.o !== 'string' ||
    typeof state.r !== 'string' ||
    typeof state.exp !== 'number' ||
    state.exp < Date.now() ||
    !timingSafeEqual(state.n, nonce)
  ) {
    return fail(expired);
  }

  const tokens = await exchangeCode(config, code, state.v, `${state.o}${callbackPath}`, fetchFn);
  if (idTokenEmail(tokens.id_token) !== config.OWNER_GOOGLE_ACCOUNT) {
    return fail(
      'This Google account is not the one this server is set up for. Nothing was saved.',
      403,
    );
  }
  if (!tokens.scope.split(' ').includes(GOOGLE_CALENDAR_SCOPE)) {
    return fail('Calendar access was not allowed. Start again and allow access to your calendar.');
  }
  if (!tokens.refresh_token) {
    return fail(
      'Google did not grant lasting access. Remove Desk Twin at myaccount.google.com/connections, then start again.',
    );
  }
  const now = Date.now();
  await store.saveLink(
    config.OWNER_GOOGLE_ACCOUNT,
    await seal(tokens.refresh_token, config.TOKEN_KEY),
    now,
  );
  await store.saveAccess(
    await seal(tokens.access_token, config.TOKEN_KEY),
    now + tokens.expires_in * 1000,
  );
  log('google.connected');
  return { ok: true, origin: state.o, returnTo: state.r, clearCookie: clearNonce(cookiePath) };
}
