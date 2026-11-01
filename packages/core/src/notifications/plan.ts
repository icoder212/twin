import {
  CHANNEL_LABELS,
  DELIVERY_CHANNELS,
  isContactChannel,
  type Contact,
  type ContactChannel,
  type DeliveryChannel,
  type NotificationPolicy,
  type NotificationPreferences,
  type Urgency,
} from '../domain/notifications';

/**
 * Decides where one notification goes. The same rules run on the server when a real alert fires
 * and in the client to explain, ahead of time, what will happen to each urgency.
 */
export interface DeliveryContext {
  preferences: NotificationPreferences;
  policy: Pick<
    NotificationPolicy,
    'allowedChannels' | 'allowSupervisorEscalation' | 'supervisorLabel'
  >;
  contacts: Contact[];
  /** Wall-clock minutes since midnight in the user's timezone. */
  localMinutes: number;
  /** Day of the week in the user's timezone; 0 is Sunday. */
  weekday: number;
  /** The user's trading session as 24-hour local times. */
  session: { start: string; end: string };
}

export type PlannedStatus = 'send' | 'held' | 'skipped';

export interface PlannedDelivery {
  channel: DeliveryChannel;
  status: PlannedStatus;
  /** Masked destination for channels outside the app. */
  to?: string;
  note?: string;
}

export interface PlanOptions {
  /** Explicit channels, e.g. a briefing's own list, instead of the urgency routing. */
  channels?: DeliveryChannel[];
  /** Scheduled messages the user set a time for ignore quiet hours and the daily summary. */
  scheduled?: boolean;
}

export function toMinutes(hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Whether `minutes` falls in [start, end), wrapping past midnight when end is earlier. */
function inWindow(minutes: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

export function isQuietNow(ctx: DeliveryContext): boolean {
  const quiet = ctx.preferences.quietHours;
  if (quiet.mode === 'off') return false;
  if (quiet.weekends && (ctx.weekday === 0 || ctx.weekday === 6)) return true;
  if (quiet.mode === 'outside-session') {
    return !inWindow(ctx.localMinutes, toMinutes(ctx.session.start), toMinutes(ctx.session.end));
  }
  return inWindow(ctx.localMinutes, toMinutes(quiet.start), toMinutes(quiet.end));
}

/** The app is always included; the rest follow the routing, in a stable order. */
export function channelsFor(
  urgency: Urgency,
  preferences: NotificationPreferences,
): DeliveryChannel[] {
  const chosen = new Set<DeliveryChannel>(['in-app', ...preferences.routing[urgency]]);
  return DELIVERY_CHANNELS.filter((c) => chosen.has(c));
}

function contactFor(contacts: Contact[], channel: ContactChannel): Contact | undefined {
  return contacts.find((c) => c.channel === channel);
}

export function planDeliveries(
  urgency: Urgency,
  ctx: DeliveryContext,
  options: PlanOptions = {},
): PlannedDelivery[] {
  const { preferences, policy } = ctx;
  const quiet = !options.scheduled && isQuietNow(ctx);
  const throughQuiet = urgency === 'critical' && preferences.quietHours.allowCritical;
  const digest = preferences.digest;
  const channels = options.channels
    ? DELIVERY_CHANNELS.filter((c) => c === 'in-app' || options.channels?.includes(c))
    : channelsFor(urgency, preferences);

  return channels.map((channel): PlannedDelivery => {
    if (channel === 'in-app') return { channel, status: 'send' };
    if (!policy.allowedChannels.includes(channel)) {
      return { channel, status: 'skipped', note: 'Turned off by your firm' };
    }
    let to: string | undefined;
    if (isContactChannel(channel)) {
      const contact = contactFor(ctx.contacts, channel);
      if (!contact) {
        const what = channel === 'email' || channel === 'teams' ? 'address' : 'number';
        return { channel, status: 'skipped', note: `No verified ${what} yet` };
      }
      to = contact.address;
    }
    if (quiet && !throughQuiet) {
      return {
        channel,
        status: 'held',
        to,
        note: digest.enabled
          ? `Quiet hours: held for your ${digest.time} summary`
          : 'Quiet hours: shown in the app only',
      };
    }
    if (!options.scheduled && urgency === 'info' && digest.enabled && isContactChannel(channel)) {
      return { channel, status: 'held', to, note: `Bundled into your ${digest.time} summary` };
    }
    return { channel, status: 'send', to };
  });
}

export interface EscalationPlan {
  afterMinutes: number;
  /** Verified, allowed channels to repeat the alert on. */
  channels: DeliveryChannel[];
  /** The firm's supervisor or desk, when both the firm and the user allow it. */
  supervisor: string | null;
  /** Plain description, e.g. "Text message and Risk desk". */
  target: string;
}

/**
 * Critical alerts nobody acknowledges are repeated on every verified channel the firm allows,
 * and optionally sent to a supervisor. Other urgencies never escalate.
 */
export function planEscalation(urgency: Urgency, ctx: DeliveryContext): EscalationPlan | null {
  const { escalation } = ctx.preferences;
  if (urgency !== 'critical' || !escalation.enabled) return null;
  const channels = DELIVERY_CHANNELS.filter(
    (c) =>
      c !== 'in-app' &&
      ctx.policy.allowedChannels.includes(c) &&
      (!isContactChannel(c) || contactFor(ctx.contacts, c) !== undefined),
  );
  const supervisor =
    escalation.notifySupervisor && ctx.policy.allowSupervisorEscalation
      ? ctx.policy.supervisorLabel
      : null;
  if (channels.length === 0 && !supervisor) return null;
  const parts = [
    channels.length > 0 ? `Every verified channel (${channels.length})` : null,
    supervisor,
  ].filter((p): p is string => p !== null);
  return {
    afterMinutes: escalation.afterMinutes,
    channels,
    supervisor,
    target: parts.join(' and '),
  };
}

export function describeChannels(channels: DeliveryChannel[]): string {
  return channels.map((c) => CHANNEL_LABELS[c]).join(', ');
}
