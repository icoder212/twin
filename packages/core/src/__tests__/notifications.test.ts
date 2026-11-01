import { beforeEach, describe, expect, it } from 'vitest';
import type { ApiError } from '../api/errors';
import { allPassed, runAdviceChecks } from '../compliance/advice-checks';
import { DELIVERY_CHANNELS, startVerificationInputSchema } from '../domain/notifications';
import { createMockApi } from '../mock/mock-api';
import {
  seedContacts,
  seedNotificationEvents,
  seedNotificationPreferences,
} from '../mock/notify-fixtures';
import { DEMO_MFA_CODE, DEMO_PASSWORD, DEMO_USERS } from '../mock/users';
import {
  isQuietNow,
  planDeliveries,
  planEscalation,
  type DeliveryContext,
} from '../notifications/plan';
import { maskAddress, renderMessage } from '../notifications/render';
import { createMemoryStore } from '../storage/kv';
import { getTenantPreset } from '../tenants/presets';

const alchmai = getTenantPreset('alchmai');
const user = { ...DEMO_USERS[0]!, tenantId: 'alchmai' };
const policy = { ...alchmai.notifications };

function ctx(overrides: Partial<DeliveryContext> = {}): DeliveryContext {
  return {
    preferences: seedNotificationPreferences(policy),
    policy,
    contacts: seedContacts(user, policy, Date.now()),
    localMinutes: 10 * 60,
    weekday: 1,
    session: { start: '07:00', end: '16:30' },
    ...overrides,
  };
}

const byChannel = (plan: ReturnType<typeof planDeliveries>) =>
  Object.fromEntries(plan.map((p) => [p.channel, p]));

describe('delivery planning', () => {
  it('always includes the app and follows the routing for each urgency', () => {
    const plan = planDeliveries('important', ctx());
    expect(plan.map((p) => p.channel)).toEqual(['in-app', 'push', 'email']);
    expect(plan.every((p) => p.status === 'send')).toBe(true);
  });

  it('skips channels the firm turned off and channels without a verified contact', () => {
    const plan = byChannel(
      planDeliveries(
        'critical',
        ctx({ policy: { ...policy, allowedChannels: ['in-app', 'push', 'email', 'teams'] } }),
      ),
    );
    expect(plan.whatsapp).toMatchObject({ status: 'skipped', note: 'Turned off by your firm' });
    expect(plan.teams).toMatchObject({ status: 'skipped', note: 'No verified address yet' });
    expect(plan.email?.status).toBe('send');
  });

  it('holds messages in quiet hours but lets critical alerts through', () => {
    const night = ctx({ localMinutes: 23 * 60 });
    expect(isQuietNow(night)).toBe(true);
    expect(byChannel(planDeliveries('important', night)).email).toMatchObject({
      status: 'held',
      note: 'Quiet hours: held for your 17:30 summary',
    });
    expect(byChannel(planDeliveries('critical', night)).whatsapp?.status).toBe('send');
  });

  it('wraps custom quiet hours past midnight and treats weekends as quiet', () => {
    const base = ctx();
    const custom = {
      ...base,
      preferences: {
        ...base.preferences,
        quietHours: { ...base.preferences.quietHours, mode: 'custom' as const, weekends: false },
      },
    };
    expect(isQuietNow({ ...custom, localMinutes: 22 * 60 })).toBe(true);
    expect(isQuietNow({ ...custom, localMinutes: 5 * 60 })).toBe(true);
    expect(isQuietNow({ ...custom, localMinutes: 12 * 60 })).toBe(false);
    expect(isQuietNow({ ...base, weekday: 6 })).toBe(true);
  });

  it('bundles info messages into the daily summary, except scheduled briefings', () => {
    expect(byChannel(planDeliveries('info', ctx())).email?.status).toBe('held');
    const briefing = planDeliveries('info', ctx({ localMinutes: 23 * 60 }), {
      channels: ['email', 'whatsapp'],
      scheduled: true,
    });
    expect(briefing.map((p) => [p.channel, p.status])).toEqual([
      ['in-app', 'send'],
      ['email', 'send'],
      ['whatsapp', 'send'],
    ]);
  });

  it('escalates only critical alerts, to the supervisor when both sides allow it', () => {
    expect(planEscalation('important', ctx())).toBeNull();
    expect(planEscalation('critical', ctx())).toMatchObject({
      afterMinutes: 5,
      supervisor: 'Risk desk',
    });
    const noSupervisor = planEscalation(
      'critical',
      ctx({ policy: { ...policy, allowSupervisorEscalation: false } }),
    );
    expect(noSupervisor?.supervisor).toBeNull();
  });
});

describe('message wording', () => {
  const events = seedNotificationEvents(user, policy, Date.now());

  it('passes the advice checks on every channel and privacy level', () => {
    for (const event of events)
      for (const channel of DELIVERY_CHANNELS)
        for (const privacy of ['minimal', 'standard'] as const) {
          const m = renderMessage(event, channel, { productName: 'Desk Twin', privacy });
          const text = [m.subject, m.title, m.body, m.footer].filter(Boolean).join('\n');
          const results = runAdviceChecks(text, {
            requiresCitations: false,
            citedIndexes: [],
            retrievedIndexes: [],
          });
          expect(allPassed(results), `${event.ref} ${channel} ${privacy}`).toBe(true);
        }
  });

  it('keeps figures and details inside the app when wording is minimal', () => {
    for (const event of events)
      for (const channel of DELIVERY_CHANNELS.filter((c) => c !== 'in-app')) {
        const m = renderMessage(event, channel, { productName: 'Desk Twin', privacy: 'minimal' });
        const text = [m.subject, m.title, m.body].filter(Boolean).join(' ');
        expect(text).not.toContain(event.body);
        expect(text).not.toMatch(/\d/);
      }
  });

  it('fits text messages in one SMS and tells WhatsApp users it cannot take instructions', () => {
    const long = { ...events[0]!, body: 'x'.repeat(400) };
    const sms = renderMessage(long, 'sms', { productName: 'Desk Twin', privacy: 'standard' });
    expect(`${sms.body} ${sms.footer}`.length).toBeLessThanOrEqual(160);
    const wa = renderMessage(long, 'whatsapp', { productName: 'Desk Twin', privacy: 'standard' });
    expect(wa.footer).toContain('cannot take instructions');
  });

  it('masks addresses and normalises phone numbers', () => {
    expect(maskAddress('email', 'alex.morgan@demo.alchmai.com')).toBe('a•••@demo.alchmai.com');
    expect(maskAddress('sms', '+447700900123')).toBe('+44 ••• ••0123');
    const parsed = startVerificationInputSchema.parse({
      channel: 'whatsapp',
      address: '+44 (0) 7700-900 123'.replace('(0) ', ''),
      consent: true,
    });
    expect(parsed.address).toBe('+447700900123');
    expect(
      startVerificationInputSchema.safeParse({
        channel: 'sms',
        address: '07700900123',
        consent: true,
      }).success,
    ).toBe(false);
    expect(
      startVerificationInputSchema.safeParse({ channel: 'whatsapp', address: '+447700900123' })
        .success,
    ).toBe(false);
  });
});

describe('mock notifications API', () => {
  // Monday 10:00 in London, inside the demo session.
  let clock = new Date('2026-11-02T10:00:00Z');
  let api: ReturnType<typeof createMockApi>;

  async function signIn(email: string, tenantId = 'alchmai') {
    api = createMockApi({
      tenant: getTenantPreset(tenantId),
      store: createMemoryStore(),
      speed: 0,
      now: () => clock,
    });
    const result = await api.auth.login({ email, password: DEMO_PASSWORD });
    if (result.status !== 'mfa-required') throw new Error('expected MFA');
    await api.auth.verifyMfa({ challengeId: result.challengeId, code: DEMO_MFA_CODE });
  }

  beforeEach(() => {
    clock = new Date('2026-11-02T10:00:00Z');
  });

  it('escalates an unacknowledged critical alert and logs every delivery', async () => {
    await signIn('alex.morgan@demo.alchmai.com');
    const sent = await api.notifications.sendTest('critical');
    expect(sent.escalation?.status).toBe('waiting');
    expect(sent.deliveries.map((d) => d.channel)).toEqual([
      'in-app',
      'push',
      'email',
      'whatsapp',
      'teams',
    ]);
    expect(sent.deliveries.find((d) => d.channel === 'teams')?.status).toBe('skipped');

    clock = new Date(clock.getTime() + 6 * 60_000);
    const [logged] = await api.notifications.events();
    expect(logged?.escalation?.status).toBe('sent');
    expect(logged?.deliveries.some((d) => d.escalation && d.to === 'Risk desk')).toBe(true);
    const audit = await api.audit.list({ action: 'notification', outcome: 'all' });
    expect(audit.items.map((e) => e.action)).toEqual(
      expect.arrayContaining(['notification.sent', 'notification.escalated']),
    );
  });

  it('stops the escalation when the alert is acknowledged', async () => {
    await signIn('alex.morgan@demo.alchmai.com');
    const sent = await api.notifications.sendTest('critical');
    const acknowledged = await api.notifications.acknowledge(sent.id);
    expect(acknowledged.escalation?.status).toBe('cancelled');
    clock = new Date(clock.getTime() + 6 * 60_000);
    const [logged] = await api.notifications.events();
    expect(logged?.deliveries.some((d) => d.escalation)).toBe(false);
  });

  it('verifies a contact with a code before using it', async () => {
    await signIn('alex.morgan@demo.alchmai.com');
    const challenge = await api.notifications.startVerification({
      channel: 'sms',
      address: '+44 7700 900456',
      consent: true,
    });
    expect(challenge.maskedDestination).toBe('+44 ••• ••0456');
    const wrong = (await api.notifications
      .confirmVerification({ verificationId: challenge.verificationId, code: '000000' })
      .catch((e: unknown) => e)) as ApiError;
    expect(wrong.code).toBe('validation');
    const contact = await api.notifications.confirmVerification({
      verificationId: challenge.verificationId,
      code: DEMO_MFA_CODE,
    });
    expect(contact).toMatchObject({ channel: 'sms', address: '+44 ••• ••0456' });
    expect(contact.consentAt).toBeDefined();
  });

  it('lets only administrators change the firm policy, and enforces it', async () => {
    await signIn('alex.morgan@demo.alchmai.com');
    const denied = (await api.notifications
      .updatePolicy({
        allowedChannels: ['in-app'],
        requireMinimalContent: true,
        allowSupervisorEscalation: false,
      })
      .catch((e: unknown) => e)) as ApiError;
    expect(denied.code).toBe('forbidden');

    await signIn('sam.okafor@demo.alchmai.com', 'meridian');
    const blocked = (await api.notifications
      .startVerification({ channel: 'whatsapp', address: '+447700900123', consent: true })
      .catch((e: unknown) => e)) as ApiError;
    expect(blocked.code).toBe('forbidden');
    const prefs = await api.notifications.preferences();
    expect(prefs.routing.critical).not.toContain('whatsapp');
    const rejected = (await api.notifications
      .updatePreferences({ ...prefs, privacy: 'standard' })
      .catch((e: unknown) => e)) as ApiError;
    expect(rejected.fieldErrors?.privacy).toBeDefined();
  });

  it('builds and sends a briefing on its own channels', async () => {
    await signIn('alex.morgan@demo.alchmai.com');
    const [morning] = await api.briefings.list();
    expect(morning?.nextRunAt).toBeDefined();
    const preview = await api.briefings.preview('morning-brief');
    expect(preview.sections.map((s) => s.id)).toContain('releases');
    const sent = await api.briefings.sendNow('morning-brief');
    expect(sent.deliveries.map((d) => [d.channel, d.status])).toEqual([
      ['in-app', 'delivered'],
      ['email', 'delivered'],
      ['whatsapp', 'delivered'],
    ]);
  });
});
