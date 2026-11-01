import type { BriefingsApi, NotificationsApi } from '../api/contracts';
import { ApiError } from '../api/errors';
import type { Session, User } from '../domain/auth';
import {
  BRIEFING_META,
  BRIEFING_SECTION_LABELS,
  CHANNEL_LABELS,
  DEFAULT_SESSION_HOURS,
  URGENCY_LABELS,
  briefingKindSchema,
  confirmVerificationInputSchema,
  contactChannelSchema,
  notificationPolicyInputSchema,
  notificationPreferencesSchema,
  startVerificationInputSchema,
  updateBriefingInputSchema,
  urgencySchema,
  type Briefing,
  type BriefingKind,
  type BriefingSchedule,
  type BriefingSection,
  type Contact,
  type ContactChannel,
  type DeliveryChannel,
  type NotificationEvent,
  type NotificationTopic,
  type Urgency,
} from '../domain/notifications';
import type { AuditAction, AuditEvent, Notification } from '../domain/operations';
import {
  planDeliveries,
  planEscalation,
  type DeliveryContext,
  type PlanOptions,
} from '../notifications/plan';
import { maskAddress } from '../notifications/render';
import { createId, createNotificationRef } from '../security/ids';
import type { MockDb, UserData } from './db';
import { buildRuleWatch, ECONOMIC_EVENTS, seedNews } from './fixtures';
import { DEMO_MFA_CODE } from './users';
import { atLocalTime, minutesSinceMidnight, notFound, parseInput, weekdayIn } from './util';

export interface NotifyDeps {
  db: MockDb;
  now: () => Date;
  latency: (min?: number, spread?: number) => Promise<void>;
  requireSession: (permission?: 'tenant.configure') => Session;
  data: (session: Session) => UserData;
  persist: (session: Session) => void;
  audit: (
    actor: Pick<User, 'id' | 'name' | 'role'> | AuditEvent['actor'],
    action: AuditAction,
    outcome: AuditEvent['outcome'],
    summary: string,
    ref?: string,
  ) => void;
}

export interface DispatchInput {
  topic: NotificationTopic;
  urgency: Urgency;
  title: string;
  body: string;
  href?: string;
  options?: PlanOptions;
}

const SYSTEM = { id: 'system', name: 'System', role: 'system' as const };
const MAX_EVENTS = 100;
const VERIFY_TTL_MS = 10 * 60_000;
const MAX_VERIFY_ATTEMPTS = 5;

const TOMORROW = [
  '08:00 EUR German Ifo business climate (medium impact)',
  '13:30 USD Durable goods orders m/m (high impact)',
  '15:00 USD New home sales (medium impact)',
];

const JOURNAL_PROMPTS = [
  'What was your plan before the session, and how did today’s trades compare with it?',
  'Which rule did you think about most today, and when?',
  'Anything to add to tomorrow’s routine?',
];

/**
 * Notifications and briefings for the mock backend: the behaviour the real service needs, with
 * deliveries simulated instead of sent.
 */
export function createNotifyApi(deps: NotifyDeps) {
  const { db, now, latency, requireSession, data, persist, audit } = deps;
  const verifications = new Map<
    string,
    {
      userId: string;
      channel: ContactChannel;
      masked: string;
      consent: boolean;
      expiresAt: number;
      attempts: number;
    }
  >();

  function context(session: Session): DeliveryContext {
    const t = now();
    const tz = session.user.timezone;
    return {
      preferences: data(session).notify.preferences,
      policy: db.policy(),
      contacts: data(session).notify.contacts,
      localMinutes: minutesSinceMidnight(tz, t),
      weekday: weekdayIn(tz, t),
      session: DEFAULT_SESSION_HOURS,
    };
  }

  function firstName(session: Session) {
    return session.user.name.split(' ')[0] ?? session.user.name;
  }

  function destination(contacts: Contact[], channel: DeliveryChannel): string | undefined {
    if (channel === 'push') return 'Your phone';
    return contacts.find((c) => c.channel === channel)?.address;
  }

  /** Plans, "sends" and logs one notification, and adds it to the bell in the app. */
  function dispatch(session: Session, input: DispatchInput): NotificationEvent {
    const d = data(session);
    const ctx = context(session);
    const at = now().toISOString();
    const planned = planDeliveries(input.urgency, ctx, input.options);
    const escalation = input.options?.scheduled ? null : planEscalation(input.urgency, ctx);
    const event: NotificationEvent = {
      id: createId('nev'),
      ref: createNotificationRef(),
      topic: input.topic,
      urgency: input.urgency,
      title: input.title,
      body: input.body,
      href: input.href,
      createdAt: at,
      deliveries: planned.map((p) => ({
        channel: p.channel,
        status: p.status === 'send' ? 'delivered' : p.status,
        at,
        to: p.to ?? destination(ctx.contacts, p.channel),
        note: p.note,
        escalation: false,
      })),
      escalation: escalation
        ? {
            status: 'waiting',
            dueAt: new Date(now().getTime() + escalation.afterMinutes * 60_000).toISOString(),
            target: escalation.target,
          }
        : undefined,
    };
    d.notify.events.unshift(event);
    if (d.notify.events.length > MAX_EVENTS) d.notify.events.length = MAX_EVENTS;
    const bell: Notification = {
      id: createId('nt'),
      title: input.title,
      body: input.body,
      severity:
        input.urgency === 'critical'
          ? 'critical'
          : input.urgency === 'important'
            ? 'warning'
            : 'info',
      at,
      read: false,
      href: input.href ?? '/notifications?tab=log',
    };
    d.notifications.unshift(bell);
    persist(session);

    const sent = planned.filter((p) => p.status === 'send').map((p) => CHANNEL_LABELS[p.channel]);
    const other = planned.filter((p) => p.status !== 'send').map((p) => CHANNEL_LABELS[p.channel]);
    audit(
      SYSTEM,
      'notification.sent',
      'success',
      `${URGENCY_LABELS[input.urgency].label} notification “${input.title}” for ${firstName(session)}: sent by ${sent.join(', ')}${other.length ? `; held or skipped: ${other.join(', ')}` : ''}`,
      event.ref,
    );
    return event;
  }

  /** Escalates critical notifications nobody acknowledged in time. A job does this server-side. */
  function processEscalations(session: Session) {
    const d = data(session);
    const t = now().getTime();
    let changed = false;
    for (const event of d.notify.events) {
      if (event.escalation?.status !== 'waiting' || event.acknowledgedAt) continue;
      if (Date.parse(event.escalation.dueAt) > t) continue;
      const ctx = context(session);
      const plan = planEscalation(event.urgency, ctx);
      const at = event.escalation.dueAt;
      event.escalation.status = 'sent';
      for (const channel of plan?.channels ?? []) {
        event.deliveries.push({
          channel,
          status: 'delivered',
          at,
          to: destination(ctx.contacts, channel),
          note: 'Repeated: not yet acknowledged',
          escalation: true,
        });
      }
      if (plan?.supervisor) {
        event.deliveries.push({
          channel: 'email',
          status: 'delivered',
          at,
          to: plan.supervisor,
          note: 'Escalated to your supervisor',
          escalation: true,
        });
      }
      audit(
        SYSTEM,
        'notification.escalated',
        'success',
        `“${event.title}” for ${firstName(session)} was not acknowledged in time and went to ${event.escalation.target}`,
        event.ref,
      );
      changed = true;
    }
    if (changed) persist(session);
  }

  function nextRun(schedule: BriefingSchedule, timezone: string): string | undefined {
    if (!schedule.enabled) return undefined;
    const t = now();
    for (let offset = 0; offset <= 7; offset += 1) {
      const candidate = atLocalTime(timezone, schedule.time, offset, t);
      if (candidate > t && schedule.days.includes(weekdayIn(timezone, candidate))) {
        return candidate.toISOString();
      }
    }
    return undefined;
  }

  function withNextRun(schedule: BriefingSchedule, session: Session): BriefingSchedule {
    return { ...schedule, nextRunAt: nextRun(schedule, session.user.timezone) };
  }

  function buildBriefing(session: Session, kind: BriefingKind, sections: BriefingSection[]) {
    const d = data(session);
    const t = now();
    const rw = buildRuleWatch(d.deskType, session.user.timezone, t);
    const pending = d.approvals.filter((a) => a.status === 'pending');
    const items: Record<BriefingSection, () => string[]> = {
      releases: () =>
        ECONOMIC_EVENTS.map(
          (e) =>
            `${e.time} ${e.currency} ${e.title}, ${e.impact} impact. Previous ${e.previous}, consensus ${e.consensus}.`,
        ),
      limits: () => [
        `Daily loss: ${rw.dailyLossUsedPct}% of your ${rw.dailyLossLimitPct}% limit used. It resets at ${rw.resetsAt}.`,
        `Drawdown: ${rw.drawdownUsedPct}% of your ${rw.maxDrawdownPct}% maximum used.`,
        `Trades this session: ${rw.tradesToday} of ${rw.maxTradesPerSession}.`,
      ],
      'action-items': () => {
        const open = d.actionItems.filter((i) => !i.done);
        return open.length
          ? open.map((i) => (i.due ? `${i.title} (${i.due})` : i.title))
          : ['Nothing open.'];
      },
      approvals: () =>
        pending.length
          ? pending.map((a) => `${a.title}, to ${a.recipients.map((r) => r.name).join(', ')}`)
          : ['Nothing waiting.'],
      news: () => seedNews(t.getTime()).map((n) => `${n.headline} (${n.source})`),
      sources: () => {
        const notes = d.sources.flatMap((s) => {
          if (s.status === 'error') return [`${s.name}: stopped fetching and needs reconnecting.`];
          if (s.health?.retry)
            return [
              `${s.name}: retrying, attempt ${s.health.retry.attempt} of ${s.health.retry.maxAttempts}.`,
            ];
          return [];
        });
        return notes.length ? notes : ['Every connected source is fetching normally.'];
      },
      'session-summary': () => [
        `${rw.tradesToday} trades of the ${rw.maxTradesPerSession} your rules allow per session.`,
        `Daily loss: ${rw.dailyLossUsedPct}% of ${rw.dailyLossLimitPct}% used. Drawdown: ${rw.drawdownUsedPct}% of ${rw.maxDrawdownPct}%.`,
        'No rule breaches recorded today.',
      ],
      journal: () => JOURNAL_PROMPTS,
      tomorrow: () => TOMORROW,
    };
    const briefing: Briefing = {
      kind,
      title: BRIEFING_META[kind].title,
      generatedAt: t.toISOString(),
      sections: sections.map((id) => ({
        id,
        heading: BRIEFING_SECTION_LABELS[id],
        items: items[id]().slice(0, 12),
      })),
    };
    return { briefing, rw, pending };
  }

  function scheduleFor(session: Session, kind: BriefingKind): BriefingSchedule {
    return data(session).notify.briefings.find((b) => b.kind === kind) ?? notFound('briefing');
  }

  function assertAllowed(channels: DeliveryChannel[], field: string) {
    const policy = db.policy();
    const blocked = channels.filter((c) => c !== 'in-app' && !policy.allowedChannels.includes(c));
    if (blocked.length) {
      const names = blocked.map((c) => CHANNEL_LABELS[c]).join(', ');
      throw new ApiError('validation', `${names} is turned off by your firm.`, {
        status: 422,
        fieldErrors: { [field]: `${names} is turned off by your firm` },
      });
    }
  }

  const notifications: NotificationsApi = {
    async preferences() {
      const session = requireSession();
      await latency();
      return data(session).notify.preferences;
    },
    async updatePreferences(input) {
      const parsed = parseInput(notificationPreferencesSchema, input);
      const session = requireSession();
      await latency(250, 250);
      const policy = db.policy();
      for (const urgency of ['info', 'important', 'critical'] as const) {
        assertAllowed(parsed.routing[urgency], `routing.${urgency}`);
        // The app always receives every notification.
        if (!parsed.routing[urgency].includes('in-app')) parsed.routing[urgency].unshift('in-app');
      }
      if (policy.requireMinimalContent && parsed.privacy !== 'minimal') {
        throw new ApiError('validation', 'Your firm requires minimal wording outside the app.', {
          status: 422,
          fieldErrors: { privacy: 'Your firm requires minimal wording' },
        });
      }
      if (!policy.allowSupervisorEscalation) parsed.escalation.notifySupervisor = false;
      data(session).notify.preferences = parsed;
      persist(session);
      audit(
        session.user,
        'notification.settings-changed',
        'success',
        'Changed notification settings',
      );
      return parsed;
    },
    async contacts() {
      const session = requireSession();
      await latency();
      return data(session).notify.contacts;
    },
    async startVerification(input) {
      const parsed = parseInput(startVerificationInputSchema, input);
      const session = requireSession();
      await latency(500, 300);
      if (!db.policy().allowedChannels.includes(parsed.channel)) {
        throw new ApiError(
          'forbidden',
          `Your firm has turned off ${CHANNEL_LABELS[parsed.channel]} notifications.`,
          { status: 403 },
        );
      }
      const verificationId = createId('ver');
      const masked = maskAddress(parsed.channel, parsed.address);
      const expiresAt = now().getTime() + VERIFY_TTL_MS;
      // The full address would be stored server-side here; the mock keeps only the masked form.
      verifications.set(verificationId, {
        userId: session.user.id,
        channel: parsed.channel,
        masked,
        consent: 'consent' in parsed,
        expiresAt,
        attempts: 0,
      });
      return {
        verificationId,
        channel: parsed.channel,
        maskedDestination: masked,
        expiresAt: new Date(expiresAt).toISOString(),
      };
    },
    async confirmVerification(input) {
      const parsed = parseInput(confirmVerificationInputSchema, input);
      const session = requireSession();
      await latency(400, 300);
      const pending = verifications.get(parsed.verificationId);
      if (!pending || pending.userId !== session.user.id || pending.expiresAt < now().getTime()) {
        verifications.delete(parsed.verificationId);
        throw new ApiError('validation', 'That code has expired. Ask for a new one.', {
          status: 422,
          fieldErrors: { code: 'That code has expired. Ask for a new one' },
        });
      }
      if (parsed.code !== DEMO_MFA_CODE) {
        pending.attempts += 1;
        if (pending.attempts >= MAX_VERIFY_ATTEMPTS) verifications.delete(parsed.verificationId);
        throw new ApiError(
          'validation',
          pending.attempts >= MAX_VERIFY_ATTEMPTS
            ? 'Too many attempts. Ask for a new code.'
            : 'That code is not right. Check it and try again.',
          { status: 422, fieldErrors: { code: 'That code is not right' } },
        );
      }
      verifications.delete(parsed.verificationId);
      const at = now().toISOString();
      const contact: Contact = {
        channel: pending.channel,
        address: pending.masked,
        verifiedAt: at,
        consentAt: pending.consent ? at : undefined,
      };
      const d = data(session);
      d.notify.contacts = [
        ...d.notify.contacts.filter((c) => c.channel !== contact.channel),
        contact,
      ];
      persist(session);
      audit(
        session.user,
        'notification.contact-verified',
        'success',
        `Verified ${CHANNEL_LABELS[contact.channel]} ${contact.address}${contact.consentAt ? ' with consent recorded' : ''}`,
      );
      return contact;
    },
    async removeContact(channel) {
      const parsedChannel = parseInput(contactChannelSchema, channel);
      const session = requireSession();
      await latency();
      const d = data(session);
      const contact =
        d.notify.contacts.find((c) => c.channel === parsedChannel) ?? notFound('contact');
      d.notify.contacts = d.notify.contacts.filter((c) => c.channel !== parsedChannel);
      persist(session);
      audit(
        session.user,
        'notification.contact-removed',
        'success',
        `Removed ${CHANNEL_LABELS[contact.channel]} ${contact.address}`,
      );
    },
    async policy() {
      requireSession();
      await latency(80, 120);
      return db.policy();
    },
    async updatePolicy(input) {
      const parsed = parseInput(notificationPolicyInputSchema, input);
      const session = requireSession('tenant.configure');
      await latency(300, 300);
      const before = db.policy();
      const allowed = new Set<DeliveryChannel>(['in-app', ...parsed.allowedChannels]);
      const policy = {
        ...before,
        ...parsed,
        allowedChannels: [...allowed],
        updatedAt: now().toISOString(),
        updatedBy: session.user.name,
      };
      db.savePolicy(policy);
      const added = policy.allowedChannels.filter((c) => !before.allowedChannels.includes(c));
      const removed = before.allowedChannels.filter((c) => !policy.allowedChannels.includes(c));
      const changes = [
        added.length ? `allowed ${added.map((c) => CHANNEL_LABELS[c]).join(', ')}` : null,
        removed.length ? `turned off ${removed.map((c) => CHANNEL_LABELS[c]).join(', ')}` : null,
        before.requireMinimalContent !== policy.requireMinimalContent
          ? `${policy.requireMinimalContent ? 'required' : 'stopped requiring'} minimal wording`
          : null,
        before.allowSupervisorEscalation !== policy.allowSupervisorEscalation
          ? `${policy.allowSupervisorEscalation ? 'allowed' : 'stopped'} escalation to ${policy.supervisorLabel}`
          : null,
      ].filter((c): c is string => c !== null);
      audit(
        session.user,
        'notification.policy-changed',
        'success',
        `Firm notification policy: ${changes.length ? changes.join('; ') : 'saved without changes'}`,
      );
      return policy;
    },
    async events() {
      const session = requireSession();
      await latency();
      processEscalations(session);
      return data(session).notify.events;
    },
    async acknowledge(id) {
      const session = requireSession();
      await latency(150, 150);
      const event =
        data(session).notify.events.find((e) => e.id === id) ?? notFound('notification');
      if (!event.acknowledgedAt) {
        event.acknowledgedAt = now().toISOString();
        event.acknowledgedVia = 'in-app';
        if (event.escalation?.status === 'waiting') event.escalation.status = 'cancelled';
        persist(session);
        audit(
          session.user,
          'notification.acknowledged',
          'success',
          `Acknowledged “${event.title}”`,
          event.ref,
        );
      }
      return event;
    },
    async sendTest(urgency) {
      const level = parseInput(urgencySchema, urgency);
      const session = requireSession();
      await latency(500, 300);
      const copy: Record<Urgency, { title: string; body: string }> = {
        info: {
          title: 'Test: info notification',
          body: 'This is how info notifications reach you. Nothing needs doing.',
        },
        important: {
          title: 'Test: important alert',
          body: 'This is how important alerts reach you, for example when 80% of a limit is used.',
        },
        critical: {
          title: 'Test: critical alert',
          body: 'This is how critical alerts reach you. Acknowledge it in the app to stop the escalation.',
        },
      };
      return dispatch(session, { topic: 'test', urgency: level, ...copy[level] });
    },
  };

  const briefings: BriefingsApi = {
    async list() {
      const session = requireSession();
      await latency();
      return data(session).notify.briefings.map((b) => withNextRun(b, session));
    },
    async update(input) {
      const parsed = parseInput(updateBriefingInputSchema, input);
      const session = requireSession();
      await latency(250, 250);
      assertAllowed(parsed.channels, 'channels');
      const schedule = scheduleFor(session, parsed.kind);
      Object.assign(schedule, parsed, {
        channels: parsed.channels.includes('in-app')
          ? parsed.channels
          : (['in-app', ...parsed.channels] satisfies DeliveryChannel[]),
        days: [...new Set(parsed.days)].sort((a, b) => a - b),
        sections: BRIEFING_META[parsed.kind].sections.filter((s) => parsed.sections.includes(s)),
      });
      persist(session);
      audit(
        session.user,
        'notification.settings-changed',
        'success',
        `${schedule.enabled ? 'Scheduled' : 'Paused'} ${BRIEFING_META[schedule.kind].title.toLowerCase()} at ${schedule.time} by ${schedule.channels.map((c) => CHANNEL_LABELS[c]).join(', ')}`,
      );
      return withNextRun(schedule, session);
    },
    async preview(kind) {
      const parsedKind = parseInput(briefingKindSchema, kind);
      const session = requireSession();
      await latency(400, 300);
      return buildBriefing(session, parsedKind, scheduleFor(session, parsedKind).sections).briefing;
    },
    async sendNow(kind) {
      const parsedKind = parseInput(briefingKindSchema, kind);
      const session = requireSession();
      await latency(600, 300);
      const schedule = scheduleFor(session, parsedKind);
      const { rw, pending } = buildBriefing(session, parsedKind, schedule.sections);
      const high = ECONOMIC_EVENTS.filter((e) => e.impact === 'high').length;
      const body =
        parsedKind === 'morning-brief'
          ? `${ECONOMIC_EVENTS.length} releases today, ${high} of them high impact. Daily loss ${rw.dailyLossUsedPct}% of ${rw.dailyLossLimitPct}% used. ${pending.length} waiting for your approval.`
          : `${rw.tradesToday} trades of ${rw.maxTradesPerSession}. Daily loss ${rw.dailyLossUsedPct}% of ${rw.dailyLossLimitPct}% used. ${JOURNAL_PROMPTS.length} journal prompts waiting.`;
      const event = dispatch(session, {
        topic: 'briefing',
        urgency: 'info',
        title: `Your ${BRIEFING_META[parsedKind].title.toLowerCase()} is ready`,
        body,
        href: '/notifications?tab=briefings',
        options: { channels: schedule.channels, scheduled: true },
      });
      schedule.lastSentAt = event.createdAt;
      persist(session);
      return event;
    },
  };

  return { notifications, briefings, dispatch };
}
