import { z } from 'zod';
import {
  briefingKindSchema,
  chosenChannels,
  economicWatchUpdateSchema,
  idSchema,
  instructionRequestSchema,
  newsWatchUpdateSchema,
  notificationPreferencesSchema,
  urgencySchema,
  ruleWatchUpdateSchema,
  usageCapUpdateSchema,
  type AccountStatus,
  type Notification,
  type NotificationEvent,
  marketSessionsUpdateSchema,
  marketWatchUpdateSchema,
} from '@twindesk/core';
import {
  BRIEF_KINDS,
  briefState,
  briefUpdateSchema,
  buildBrief,
  loadBrief,
  saveBrief,
  sendBrief,
} from './briefing';
import type { Config } from './config';
import { economicState, loadWatch, saveWatch } from './economic';
import { apiError, json, redirect, text, withCookies } from './http';
import { IgError, searchMarkets } from './ig';
import { interpret, InstructionError } from './instructions';
import { marketsState, saveMarketWatch } from './market-moves';
import { ruleWatchState, saveRuleLimits } from './rule-watch';
import { saveSessions } from './session-notes';
import { saveWhatsAppCap, usageState } from './usage';
import { loadNewsWatch, newsState, saveNewsWatch } from './news';
import { localTime, notify } from './notify';
import { loadPreferences, savePreferences, serverContacts, serverPolicy } from './settings';
import { beginGoogle, completeGoogle } from './signin';
import { endSession, readSession, sameAppRequest, startSession } from './session';
import type { Store } from './store';
import { reminderTemplate } from './whatsapp';

export interface ApiDeps {
  config: Config;
  store: Store;
  fetch: typeof fetch;
}

const CALLBACK = '/v1/auth/google/callback';
const COOKIE_PATH = '/v1/auth';
const MAX_BODY_BYTES = 64 * 1024;
const LIST_LIMIT = 100;
const RETURN_PATH = /^\/(?!\/)[\w\-/?=&.]{0,200}$/;

const SERVER_MANAGED =
  'Your email and WhatsApp number are set on the server for now, so they cannot be changed here.';

const TEST_COPY = {
  info: {
    title: 'Test: info notification',
    body: 'This is how info notifications reach you. Nothing needs doing.',
  },
  important: {
    title: 'Test: important alert',
    body: 'This is how important alerts reach you, for example a meeting about to start.',
  },
  critical: {
    title: 'Test: critical alert',
    body: 'This is how critical alerts reach you, for example a data source stopping.',
  },
} as const;

class BadRequest extends Error {}

async function readBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) throw new BadRequest('That request is too large.');
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new BadRequest('That request could not be read.');
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new BadRequest('Something in that request is not valid.');
  return parsed.data;
}

/** The bell in the app: the same notifications, in its shorter shape. */
function toBell(event: NotificationEvent, read: boolean): Notification {
  return {
    id: event.id,
    title: event.title,
    body: event.body,
    severity:
      event.urgency === 'critical'
        ? 'critical'
        : event.urgency === 'important'
          ? 'warning'
          : 'info',
    at: event.createdAt,
    read,
    href: event.href ?? '/notifications?tab=log',
  };
}

/** Routes under /v1, which the app reaches on its own domain through a proxy. */
export async function handleApi(request: Request, url: URL, deps: ApiDeps): Promise<Response> {
  const { config, store } = deps;
  const route = `${request.method} ${url.pathname}`;

  if (route === 'GET /v1/auth/google/start') {
    const origin = url.searchParams.get('origin') ?? '';
    const returnTo = url.searchParams.get('return') ?? '/notifications';
    if (!config.APP_ORIGINS.includes(origin)) return text('This site cannot sign in here.', 400);
    return beginGoogle(config, {
      origin,
      callbackPath: CALLBACK,
      returnTo: RETURN_PATH.test(returnTo) ? returnTo : '/notifications',
      cookiePath: COOKIE_PATH,
    });
  }
  if (route === `GET ${CALLBACK}`) {
    const outcome = await completeGoogle(
      config,
      store,
      url,
      request,
      CALLBACK,
      COOKIE_PATH,
      deps.fetch,
    );
    if (!outcome.ok) return outcome.response;
    const cookies = await startSession(store, config.OWNER_GOOGLE_ACCOUNT, Date.now());
    const back = `${outcome.origin}${outcome.returnTo}${outcome.returnTo.includes('?') ? '&' : '?'}account=connected`;
    return withCookies(redirect(back), [...cookies, outcome.clearCookie]);
  }

  const now = Date.now();
  const session = await readSession(store, request, now);
  if (route === 'GET /v1/account') {
    if (!session) return json({ signedIn: false } satisfies AccountStatus);
    const link = await store.getLink();
    return json({
      signedIn: true,
      email: session.email,
      calendarConnected: link !== null,
      channels: { email: Boolean(config.RESEND_API_KEY), whatsapp: true },
    } satisfies AccountStatus);
  }
  if (!session) return apiError(401, 'Sign in with Google again to see your notifications.');
  if (request.method !== 'GET' && !sameAppRequest(request, session, config.APP_ORIGINS)) {
    return apiError(403, 'This change could not be verified. Reload the page and try again.');
  }

  try {
    const acknowledge = /^\/v1\/notifications\/events\/([\w-]{1,64})\/acknowledge$/.exec(
      url.pathname,
    );
    if (request.method === 'POST' && acknowledge?.[1]) {
      const stored = await store.getNotification(acknowledge[1]);
      if (!stored) return apiError(404, 'That notification no longer exists.');
      const event: NotificationEvent = {
        ...stored.event,
        acknowledgedAt: stored.event.acknowledgedAt ?? new Date(now).toISOString(),
        acknowledgedVia: stored.event.acknowledgedVia ?? 'in-app',
      };
      await store.saveNotification(event, true);
      return json(event);
    }
    if (
      url.pathname.startsWith('/v1/notifications/contacts/') ||
      route === 'POST /v1/notifications/contacts/verify'
    ) {
      return apiError(409, SERVER_MANAGED);
    }
    const brief = /^\/v1\/briefings\/([\w-]{1,32})(?:\/(preview|send))?$/.exec(url.pathname);
    if (brief) {
      const kind = briefingKindSchema.safeParse(brief[1]);
      if (!kind.success) return apiError(404, 'There is no such briefing.');
      const briefDeps = { ...deps, now };
      switch (`${request.method} ${brief[2] ?? ''}`) {
        case 'PUT ': {
          const input = await readBody(request, briefUpdateSchema);
          const saved = await saveBrief(briefDeps, input, kind.data);
          if (!saved) return apiError(422, 'Pick at least one section.');
          return json(await briefState(briefDeps, kind.data));
        }
        case 'GET preview': {
          const { sections } = await loadBrief(store, kind.data);
          return json((await buildBrief(briefDeps, sections, kind.data)).briefing);
        }
        case 'POST send':
          return json(await sendBrief(briefDeps, await loadBrief(store, kind.data)));
        default:
          return apiError(404, 'Not found.');
      }
    }

    switch (route) {
      case 'POST /v1/account/sign-out':
        return withCookies(
          json({ signedIn: false } satisfies AccountStatus),
          await endSession(store, request),
        );
      case 'GET /v1/notifications': {
        const list = await store.listNotifications(50);
        return json(list.map((n) => toBell(n.event, n.read)));
      }
      case 'POST /v1/notifications/read': {
        const { ids } = await readBody(request, z.object({ ids: z.array(idSchema).max(100) }));
        await store.markRead(ids);
        return new Response(null, { status: 204 });
      }
      case 'GET /v1/notifications/preferences':
        return json(await loadPreferences(store));
      case 'PUT /v1/notifications/preferences': {
        const input = await readBody(request, notificationPreferencesSchema);
        return json(await savePreferences(store, input, now));
      }
      case 'GET /v1/notifications/contacts': {
        const link = await store.getLink();
        return json(serverContacts(config, new Date(link?.connectedAt ?? now).toISOString()));
      }
      case 'GET /v1/notifications/policy':
        return json(serverPolicy());
      case 'PUT /v1/notifications/policy':
        return apiError(403, 'The channels this server can use are fixed for now.');
      case 'GET /v1/notifications/events': {
        const list = await store.listNotifications(LIST_LIMIT);
        return json(list.map((n) => n.event));
      }
      case 'POST /v1/notifications/test': {
        const { urgency } = await readBody(request, z.object({ urgency: urgencySchema }));
        const preferences = await loadPreferences(store);
        const event = await notify(
          { ...deps, now },
          {
            topic: 'test',
            urgency,
            ...TEST_COPY[urgency],
            href: '/notifications?tab=log',
            channels: chosenChannels(preferences),
            whatsapp: reminderTemplate(
              config,
              'Desk Twin test',
              localTime(config, new Date(now).toISOString()),
            ),
          },
        );
        return json(event);
      }
      case 'GET /v1/briefings':
        return json(
          await Promise.all(BRIEF_KINDS.map((kind) => briefState({ ...deps, now }, kind))),
        );
      case 'GET /v1/economic':
        return json(await economicState({ ...deps, now }));
      case 'PUT /v1/economic/watch': {
        const { watch, channels } = await readBody(request, economicWatchUpdateSchema);
        if (channels) {
          const preferences = await loadPreferences(store);
          const routing = { ...preferences.routing, release: ['in-app' as const, ...channels] };
          await savePreferences(store, { ...preferences, routing }, now);
        }
        await saveWatch({ ...deps, now }, watch);
        return json(await economicState({ ...deps, now }));
      }
      case 'DELETE /v1/economic/watch':
        await saveWatch({ ...deps, now }, null);
        return json(await economicState({ ...deps, now }));
      case 'GET /v1/markets':
        return json(await marketsState({ ...deps, now }));
      case 'GET /v1/markets/search': {
        const term = (url.searchParams.get('q') ?? '').trim();
        if (term.length < 2 || term.length > 40) {
          return apiError(422, 'Type 2 to 40 characters to search.');
        }
        try {
          return json(await searchMarkets({ ...deps, now }, term));
        } catch (error) {
          if (error instanceof IgError) return apiError(502, error.message);
          throw error;
        }
      }
      case 'PUT /v1/markets/watch': {
        const { watch, channels } = await readBody(request, marketWatchUpdateSchema);
        if (channels) {
          const preferences = await loadPreferences(store);
          const routing = { ...preferences.routing, price: ['in-app' as const, ...channels] };
          await savePreferences(store, { ...preferences, routing }, now);
        }
        await saveMarketWatch(store, watch, now);
        return json(await marketsState({ ...deps, now }));
      }
      case 'GET /v1/rules':
        return json(await ruleWatchState({ ...deps, now }));
      case 'PUT /v1/rules/watch': {
        const { limits, channels } = await readBody(request, ruleWatchUpdateSchema);
        if (channels) {
          const preferences = await loadPreferences(store);
          const routing = {
            ...preferences.routing,
            'loss-limit': ['in-app' as const, ...channels],
          };
          await savePreferences(store, { ...preferences, routing }, now);
        }
        await saveRuleLimits(store, limits, now);
        return json(await ruleWatchState({ ...deps, now }));
      }
      case 'DELETE /v1/rules/watch':
        await saveRuleLimits(store, null, now);
        return json(await ruleWatchState({ ...deps, now }));
      case 'PUT /v1/markets/sessions': {
        const { sessions } = await readBody(request, marketSessionsUpdateSchema);
        await saveSessions(store, sessions, now);
        return json(await marketsState({ ...deps, now }));
      }
      case 'GET /v1/usage':
        return json(await usageState({ ...deps, now }));
      case 'PUT /v1/usage/cap': {
        const { whatsappCap } = await readBody(request, usageCapUpdateSchema);
        await saveWhatsAppCap(store, whatsappCap, now);
        return json(await usageState({ ...deps, now }));
      }
      case 'DELETE /v1/markets/watch':
        await saveMarketWatch(store, null, now);
        return json(await marketsState({ ...deps, now }));
      case 'GET /v1/news':
        return json(await newsState({ ...deps, now }));
      case 'PUT /v1/news/watch': {
        const { watch, channels } = await readBody(request, newsWatchUpdateSchema);
        if (channels) {
          const preferences = await loadPreferences(store);
          const routing = { ...preferences.routing, news: ['in-app' as const, ...channels] };
          await savePreferences(store, { ...preferences, routing }, now);
        }
        await saveNewsWatch(store, watch, now);
        return json(await newsState({ ...deps, now }));
      }
      case 'DELETE /v1/news/watch':
        await saveNewsWatch(store, null, now);
        return json(await newsState({ ...deps, now }));
      case 'POST /v1/instructions': {
        const { text: instruction } = await readBody(request, instructionRequestSchema);
        const { routing } = await loadPreferences(store);
        const current = { economic: await loadWatch(store), news: await loadNewsWatch(store) };
        try {
          return json(
            await interpret({ ...deps, now }, instruction, current, {
              economic: routing.release,
              news: routing.news,
            }),
          );
        } catch (error) {
          if (error instanceof InstructionError) return apiError(error.status, error.message);
          throw error;
        }
      }
      default:
        return apiError(404, 'Not found.');
    }
  } catch (error) {
    if (error instanceof BadRequest) return apiError(422, error.message);
    throw error;
  }
}
