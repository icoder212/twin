import {
  createId,
  createNotificationRef,
  DEFAULT_SESSION_HOURS,
  formatTime,
  localClock,
  planDeliveries,
  renderMessage,
  type Delivery,
  type DeliveryChannel,
  type DeliveryContext,
  type NotificationEvent,
  type NotificationTopic,
  type Urgency,
} from '@twindesk/core';
import type { Config } from './config';
import { sendEmail } from './email';
import { loadPreferences, serverContacts, serverPolicy } from './settings';
import type { Store } from './store';
import { whatsappCapNote } from './usage';
import { deliverWhatsApp, type WhatsAppTemplate } from './whatsapp';

export interface NotifyDeps {
  config: Config;
  store: Store;
  fetch: typeof fetch;
  now: number;
}

export interface NotifyInput {
  topic: NotificationTopic;
  urgency: Urgency;
  title: string;
  body: string;
  href?: string;
  /** Explicit channels (a test uses every chosen one) instead of the type's routing. */
  channels?: DeliveryChannel[];
  /** Sent at a time the owner set, such as a briefing, so quiet hours do not hold it. */
  scheduled?: boolean;
  /** The whole message for email when the body is a summary, such as a briefing. */
  emailText?: string;
  /** An HTML version of that email, given the footer every email carries. */
  emailHtml?: (footer: string) => string;
  /** The approved WhatsApp template to use. Alerts without one are skipped on WhatsApp. */
  whatsapp?: WhatsAppTemplate;
}

const PRODUCT = 'Desk Twin';

/**
 * Records one notification and delivers it, using the same rules the app shows: the app always,
 * then the channels chosen for this type of alert, respecting quiet hours. Every outcome, sent or
 * not, is kept with the notification so the app can show it.
 */
export async function notify(deps: NotifyDeps, input: NotifyInput): Promise<NotificationEvent> {
  const { config, store, fetch, now } = deps;
  const at = new Date(now).toISOString();
  // There is no daily summary sender yet, so nothing is held for one.
  const stored = await loadPreferences(store);
  const preferences = { ...stored, digest: { ...stored.digest, enabled: false } };
  const link = await store.getLink();
  const contacts = serverContacts(config, new Date(link?.connectedAt ?? now).toISOString());
  const clock = localClock(config.TIMEZONE, new Date(now));
  const ctx: DeliveryContext = {
    preferences,
    policy: serverPolicy(),
    contacts,
    localMinutes: clock.minutes,
    weekday: clock.weekday,
    session: DEFAULT_SESSION_HOURS,
  };

  const event: NotificationEvent = {
    id: createId('nev'),
    ref: createNotificationRef(),
    topic: input.topic,
    urgency: input.urgency,
    title: input.title.slice(0, 120),
    body: input.body.slice(0, 400),
    href: input.href,
    createdAt: at,
    deliveries: [],
  };
  const outbound: Array<{ id: string; channel: DeliveryChannel }> = [];

  const planned = planDeliveries(input, ctx, {
    ...(input.channels ? { channels: input.channels } : {}),
    ...(input.scheduled ? { scheduled: true } : {}),
  });
  for (const plan of planned) {
    const delivery: Delivery = {
      channel: plan.channel,
      status: plan.status === 'send' ? 'delivered' : plan.status,
      at,
      to: plan.to,
      note: plan.note,
      escalation: false,
    };
    if (plan.status === 'send' && plan.channel === 'whatsapp') {
      const capped = input.whatsapp ? await whatsappCapNote(deps) : null;
      if (!input.whatsapp) {
        Object.assign(delivery, {
          status: 'skipped',
          note: 'No WhatsApp template for this alert yet',
        });
      } else if (capped) {
        Object.assign(delivery, { status: 'skipped', note: capped });
      } else {
        try {
          const id = await deliverWhatsApp(config, input.whatsapp, fetch);
          outbound.push({ id, channel: 'whatsapp' });
        } catch (error) {
          Object.assign(delivery, { status: 'failed', note: failure(error) });
        }
      }
    } else if (plan.status === 'send' && plan.channel === 'email') {
      try {
        const rendered = renderMessage(event, 'email', {
          productName: PRODUCT,
          privacy: preferences.privacy,
        });
        // Minimal privacy keeps the content out of email, so the full text goes only without it.
        const full = preferences.privacy !== 'minimal';
        const body = input.emailText && full ? input.emailText : rendered.body;
        const html = input.emailHtml && full ? input.emailHtml(rendered.footer) : undefined;
        const id = await sendEmail(
          config,
          {
            to: config.EMAIL_TO ?? config.OWNER_GOOGLE_ACCOUNT,
            subject: rendered.subject ?? rendered.title,
            text: `${body}\n\n${rendered.footer}`,
            ...(html ? { html } : {}),
          },
          fetch,
        );
        outbound.push({ id, channel: 'email' });
      } catch (error) {
        Object.assign(delivery, { status: 'failed', note: failure(error) });
      }
    }
    event.deliveries.push(delivery);
  }

  await store.saveNotification(event, false);
  for (const o of outbound) await store.recordOutbound(o.id, event.id, o.channel);
  return event;
}

function failure(error: unknown): string {
  return (error instanceof Error ? error.message : 'Could not send').slice(0, 160);
}

/** The time shown in messages, on the owner's clock. */
export function localTime(config: Config, iso: string): string {
  return formatTime(iso, { language: 'en-GB', timezone: config.TIMEZONE, currency: 'GBP' });
}
