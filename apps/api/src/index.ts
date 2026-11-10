import './jitless';
import type { DeliveryStatus } from '@twindesk/core';
import { handleApi } from './api';
import { readConfig, type Config, type Env } from './config';
import { timingSafeEqual } from './crypto';
import { json, text } from './http';
import { log, logError } from './log';
import { runReminders } from './reminders';
import { beginGoogle, completeGoogle } from './signin';
import { d1Store, type Store } from './store';
import { statusUpdates, verifySignature } from './whatsapp';
import type { ScheduledController } from './worker-types';

const MAX_WEBHOOK_BYTES = 256 * 1024;
const PRUNE_AFTER_MS = 7 * 86_400_000;

// Called through a wrapper so the runtime always sees the global `this`.
const fetchFn: typeof fetch = (input, init) => fetch(input, init);

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

/** Meta's message statuses, in the app's delivery terms. */
const RECEIPT_STATUS: Record<string, DeliveryStatus> = {
  sent: 'delivered',
  delivered: 'delivered',
  read: 'read',
  failed: 'failed',
};

/** Delivery receipts update the notification they belong to. Only signed bodies are read. */
async function receiveWebhook(config: Config, store: Store, request: Request): Promise<Response> {
  if (!config.WHATSAPP_APP_SECRET) return text('Not found', 404);
  const body = await request.text();
  if (body.length > MAX_WEBHOOK_BYTES) return text('Too large', 413);
  const signature = request.headers.get('X-Hub-Signature-256');
  if (!(await verifySignature(config.WHATSAPP_APP_SECRET, body, signature))) {
    return text('Forbidden', 403);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return text('Bad request', 400);
  }
  for (const { id, status } of statusUpdates(payload)) {
    const next = RECEIPT_STATUS[status];
    const notificationId = next ? await store.notificationForMessage(id) : null;
    const stored = notificationId ? await store.getNotification(notificationId) : null;
    if (!next || !stored) continue;
    const deliveries = stored.event.deliveries.map((d) =>
      d.channel === 'whatsapp' && d.status !== 'read' ? { ...d, status: next } : d,
    );
    await store.saveNotification({ ...stored.event, deliveries }, stored.read);
  }
  return text('ok');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      const config = readConfig(env);
      const store = d1Store(env.DB);
      if (url.pathname.startsWith('/v1/')) {
        return await handleApi(request, url, { config, store, fetch: fetchFn });
      }
      switch (`${request.method} ${url.pathname}`) {
        case 'GET /health':
          return json({
            ok: true,
            google: (await store.getLink()) ? 'connected' : 'not-connected',
          });
        // Connects the calendar straight on this server, without signing in to the app.
        case 'GET /google/connect':
          return await beginGoogle(config, {
            origin: url.origin,
            callbackPath: '/google/callback',
            returnTo: '',
            cookiePath: '/google',
          });
        case 'GET /google/callback': {
          const outcome = await completeGoogle(
            config,
            store,
            url,
            request,
            '/google/callback',
            '/google',
            fetchFn,
          );
          if (!outcome.ok) return outcome.response;
          return text(
            `Google Calendar is connected, read-only. A reminder will arrive ${config.REMINDER_MINUTES} minutes before each meeting, on the channels you choose in the app. You can close this window.`,
            200,
            { 'Set-Cookie': outcome.clearCookie },
          );
        }
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
