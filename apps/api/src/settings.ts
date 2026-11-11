import {
  DELIVERY_CHANNELS,
  maskAddress,
  notificationPreferencesSchema,
  ROUTABLE_TOPICS,
  type Contact,
  type DeliveryChannel,
  type NotificationPolicy,
  type NotificationPreferences,
} from '@twindesk/core';
import type { Config } from './config';
import type { Store } from './store';

const PREFERENCES_KEY = 'notification-preferences';

/** Where alerts start out: meeting reminders on WhatsApp, as before settings existed. */
export const DEFAULT_PREFERENCES: NotificationPreferences = {
  routing: {
    calendar: ['in-app', 'whatsapp'],
    price: ['in-app', 'whatsapp'],
    release: ['in-app', 'whatsapp'],
    // Headlines can be many a day; WhatsApp is opt-in, as each message costs.
    news: ['in-app'],
    'loss-limit': ['in-app', 'email', 'whatsapp'],
    'session-rule': ['in-app', 'email'],
    'source-health': ['in-app', 'email', 'whatsapp'],
    approval: ['in-app', 'email'],
    automation: ['in-app', 'email'],
  },
  quietHours: {
    mode: 'off',
    start: '22:00',
    end: '07:00',
    weekends: false,
    allowCritical: true,
  },
  digest: { enabled: false, time: '17:30' },
  escalation: { enabled: false, afterMinutes: 5, notifySupervisor: false },
  privacy: 'standard',
};

/** The channels this server can deliver to. Push, Teams and text messages are not built yet. */
export function serverPolicy(): NotificationPolicy {
  return {
    allowedChannels: ['in-app', 'email', 'whatsapp'],
    requireMinimalContent: false,
    allowSupervisorEscalation: false,
    supervisorLabel: '',
  };
}

/**
 * The owner's addresses come from the server's settings: the Google account they signed in with
 * (verified by Google) and the WhatsApp number registered with Meta. Email needs Resend.
 */
export function serverContacts(config: Config, verifiedAt: string): Contact[] {
  const contacts: Contact[] = [
    {
      channel: 'whatsapp',
      address: maskAddress('whatsapp', `+${config.WHATSAPP_TO}`),
      verifiedAt,
      consentAt: verifiedAt,
    },
  ];
  if (config.RESEND_API_KEY) {
    contacts.unshift({
      channel: 'email',
      address: maskAddress('email', config.OWNER_GOOGLE_ACCOUNT),
      verifiedAt,
    });
  }
  return contacts;
}

export async function loadPreferences(store: Store): Promise<NotificationPreferences> {
  const raw = await store.getSetting(PREFERENCES_KEY);
  if (!raw) return DEFAULT_PREFERENCES;
  try {
    const parsed = notificationPreferencesSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

/** Keeps the app on every type and drops channels this server cannot deliver to. */
export function cleanPreferences(input: NotificationPreferences): NotificationPreferences {
  const allowed = new Set<DeliveryChannel>(serverPolicy().allowedChannels);
  const routing = { ...input.routing };
  for (const topic of ROUTABLE_TOPICS) {
    const chosen = new Set(['in-app', ...routing[topic].filter((c) => allowed.has(c))]);
    routing[topic] = DELIVERY_CHANNELS.filter((c) => chosen.has(c));
  }
  return {
    ...input,
    routing,
    escalation: { ...input.escalation, notifySupervisor: false },
  };
}

export async function savePreferences(
  store: Store,
  preferences: NotificationPreferences,
  at: number,
): Promise<NotificationPreferences> {
  const clean = cleanPreferences(preferences);
  await store.putSetting(PREFERENCES_KEY, JSON.stringify(clean), at);
  return clean;
}
