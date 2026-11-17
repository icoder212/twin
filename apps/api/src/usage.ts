import {
  DELIVERY_CHANNELS,
  dayKeyIn,
  whatsappCapSchema,
  type ChannelUsage,
  type Usage,
} from '@twindesk/core';
import { zonedInstant } from './economic';
import type { NotifyDeps } from './notify';
import type { Store } from './store';
import { twilioAccount } from './whatsapp';

/**
 * Messages sent this month, what WhatsApp has cost, and the owner's monthly cap on WhatsApp
 * messages. The cap is checked before each WhatsApp send, beside Twilio's balance floor.
 */

const CAP_KEY = 'whatsapp-monthly-cap';
const SENT = new Set(['delivered', 'read']);

export async function loadWhatsAppCap(store: Store): Promise<number | null> {
  const parsed = whatsappCapSchema.safeParse(Number(await store.getSetting(CAP_KEY)));
  return parsed.success ? parsed.data : null;
}

export async function saveWhatsAppCap(store: Store, cap: number | null, now: number) {
  await store.putSetting(CAP_KEY, cap === null ? '' : String(cap), now);
}

/** Midnight on the first of this month, on the owner's clock. */
function monthStart(deps: Pick<NotifyDeps, 'config' | 'now'>): number {
  const today = dayKeyIn(deps.config.TIMEZONE, new Date(deps.now));
  return zonedInstant(`${today.slice(0, 7)}-01`, '00:00', deps.config.TIMEZONE);
}

async function whatsappSent(deps: NotifyDeps): Promise<number> {
  const counts = await deps.store.countDeliveries(monthStart(deps));
  return counts
    .filter((c) => c.channel === 'whatsapp' && SENT.has(c.status))
    .reduce((sum, c) => sum + c.count, 0);
}

/** Why a WhatsApp message may not go out under the cap, or null when it may. */
export async function whatsappCapNote(deps: NotifyDeps): Promise<string | null> {
  const cap = await loadWhatsAppCap(deps.store);
  if (cap === null || (await whatsappSent(deps)) < cap) return null;
  return `Not sent: this month’s WhatsApp cap of ${cap} messages is reached`;
}

export async function usageState(deps: NotifyDeps): Promise<Usage> {
  const start = monthStart(deps);
  const [counts, cap, account] = await Promise.all([
    deps.store.countDeliveries(start),
    loadWhatsAppCap(deps.store),
    twilioAccount(deps.config, deps.fetch),
  ]);
  const channels: ChannelUsage[] = DELIVERY_CHANNELS.map((channel) => {
    const rows = counts.filter((c) => c.channel === channel);
    const count = (match: (status: string) => boolean) =>
      rows.filter((c) => match(c.status)).reduce((sum, c) => sum + c.count, 0);
    return {
      channel,
      sent: count((s) => SENT.has(s)),
      failed: count((s) => s === 'failed'),
      skipped: count((s) => s === 'skipped' || s === 'held'),
    };
  }).filter((c) => c.sent + c.failed + c.skipped > 0);
  const month = new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: deps.config.TIMEZONE,
  }).format(new Date(deps.now));
  return {
    month,
    channels,
    whatsapp: {
      cap,
      sent: channels.find((c) => c.channel === 'whatsapp')?.sent ?? 0,
      spent: account?.spent ?? null,
      balance: account?.balance ?? null,
      currency: account?.currency ?? null,
      floor: deps.config.TWILIO_MIN_BALANCE ?? null,
    },
  };
}
