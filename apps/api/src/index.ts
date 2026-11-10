import './jitless';
import { GOOGLE_CALENDAR_SCOPE } from '@twindesk/core';
import { readConfig, type Config, type Env } from './config';
import { pkceChallenge, randomToken, seal, timingSafeEqual, unseal } from './crypto';
import { exchangeCode, googleAuthUrl, idTokenEmail } from './google';
import { cookie, json, redirect, text } from './http';
import { log, logError } from './log';
import { runReminders } from './reminders';
import { d1Store, type Store } from './store';
import { statusUpdates, verifySignature } from './whatsapp';
import type { ScheduledController } from './worker-types';

const STATE_COOKIE = 'dt_google';
const SIGN_IN_TTL_MS = 10 * 60_000;
const MAX_WEBHOOK_BYTES = 256 * 1024;
const PRUNE_AFTER_MS = 7 * 86_400_000;

// Called through a wrapper so the runtime always sees the global `this`.
const fetchFn: typeof fetch = (input, init) => fetch(input, init);

/**
 * Starts Google sign-in. The state is sealed (so nobody can read the PKCE verifier) and tied to
 * this browser by a short-lived cookie, so a sign-in link cannot be finished elsewhere.
 */
async function startGoogle(config: Config, url: URL): Promise<Response> {
  const verifier = randomToken(48);
  const nonce = randomToken(16);
  const state = await seal(
    JSON.stringify({ v: verifier, n: nonce, exp: Date.now() + SIGN_IN_TTL_MS }),
    config.TOKEN_KEY,
  );
  return redirect(
    googleAuthUrl(config, `${url.origin}/google/callback`, state, await pkceChallenge(verifier)),
    {
      'Set-Cookie': `${STATE_COOKIE}=${nonce}; Path=/google; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  );
}

async function finishGoogle(
  config: Config,
  store: Store,
  url: URL,
  request: Request,
): Promise<Response> {
  const clearCookie = { 'Set-Cookie': `${STATE_COOKIE}=; Path=/google; Max-Age=0` };
  if (url.searchParams.get('error')) {
    return text('Google sign-in was cancelled. You can close this window.', 400, clearCookie);
  }
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const nonce = cookie(request, STATE_COOKIE);
  const expired =
    'This sign-in has expired or was opened in another browser. Start again at /google/connect.';
  if (!code || !state || !nonce) return text(expired, 400, clearCookie);

  let saved: { v?: unknown; n?: unknown; exp?: unknown };
  try {
    saved = JSON.parse(await unseal(state, config.TOKEN_KEY)) as typeof saved;
  } catch {
    return text(expired, 400, clearCookie);
  }
  if (
    typeof saved.v !== 'string' ||
    typeof saved.n !== 'string' ||
    typeof saved.exp !== 'number' ||
    saved.exp < Date.now() ||
    !timingSafeEqual(saved.n, nonce)
  ) {
    return text(expired, 400, clearCookie);
  }

  const tokens = await exchangeCode(
    config,
    code,
    saved.v,
    `${url.origin}/google/callback`,
    fetchFn,
  );
  if (idTokenEmail(tokens.id_token) !== config.OWNER_GOOGLE_ACCOUNT) {
    return text(
      'This Google account is not the one this server is set up for. Nothing was saved.',
      403,
      clearCookie,
    );
  }
  if (!tokens.scope.split(' ').includes(GOOGLE_CALENDAR_SCOPE)) {
    return text(
      'Calendar access was not allowed. Start again and allow access to your calendar.',
      400,
      clearCookie,
    );
  }
  if (!tokens.refresh_token) {
    return text(
      'Google did not grant lasting access. Remove Desk Twin at myaccount.google.com/connections, then start again.',
      400,
      clearCookie,
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
  return text(
    `Google Calendar is connected, read-only. A WhatsApp reminder will arrive ${config.REMINDER_MINUTES} minutes before each meeting. You can close this window.`,
    200,
    clearCookie,
  );
}

/** Meta's one-off check when the webhook is set up: echo the challenge if the token matches. */
function verifyWebhook(config: Config, url: URL): Response {
  if (!config.WHATSAPP_VERIFY_TOKEN || !config.WHATSAPP_APP_SECRET) return text('Not found', 404);
  const token = url.searchParams.get('hub.verify_token') ?? '';
  const challenge = url.searchParams.get('hub.challenge') ?? '';
  if (
    url.searchParams.get('hub.mode') === 'subscribe' &&
    timingSafeEqual(token, config.WHATSAPP_VERIFY_TOKEN) &&
    /^[\w-]{1,128}$/.test(challenge)
  ) {
    return text(challenge);
  }
  return text('Forbidden', 403);
}

/** Delivery receipts. Only bodies signed with the app secret are read. */
async function receiveWebhook(config: Config, store: Store, request: Request): Promise<Response> {
  if (!config.WHATSAPP_APP_SECRET) return text('Not found', 404);
  const body = await request.text();
  if (body.length > MAX_WEBHOOK_BYTES) return text('Too large', 413);
  if (
    !(await verifySignature(
      config.WHATSAPP_APP_SECRET,
      body,
      request.headers.get('X-Hub-Signature-256'),
    ))
  ) {
    return text('Forbidden', 403);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return text('Bad request', 400);
  }
  for (const { id, status } of statusUpdates(payload)) await store.updateDelivery(id, status);
  return text('ok');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      const config = readConfig(env);
      const store = d1Store(env.DB);
      switch (`${request.method} ${url.pathname}`) {
        case 'GET /health':
          return json({
            ok: true,
            google: (await store.getLink()) ? 'connected' : 'not-connected',
          });
        case 'GET /google/connect':
          return await startGoogle(config, url);
        case 'GET /google/callback':
          return await finishGoogle(config, store, url, request);
        case 'GET /whatsapp/webhook':
          return verifyWebhook(config, url);
        case 'POST /whatsapp/webhook':
          return await receiveWebhook(config, store, request);
        default:
          return text('Not found', 404);
      }
    } catch (error) {
      logError(`http ${url.pathname}`, error);
      return text('Something went wrong. Try again shortly.', 500);
    }
  },

  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const now = controller.scheduledTime;
    try {
      const store = d1Store(env.DB);
      const outcome = await runReminders({ config: readConfig(env), store, fetch: fetchFn, now });
      if (outcome.status !== 'ok' || outcome.due > 0) log('reminders', outcome);
      if (new Date(now).getUTCMinutes() === 0) await store.pruneReminders(now - PRUNE_AFTER_MS);
    } catch (error) {
      logError('reminders', error);
    }
  },
};
