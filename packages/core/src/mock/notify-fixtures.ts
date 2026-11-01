import type { User } from '../domain/auth';
import type {
  BriefingSchedule,
  Contact,
  DeliveryChannel,
  NotificationEvent,
  NotificationPolicy,
  NotificationPreferences,
} from '../domain/notifications';
import { maskAddress } from '../notifications/render';
import { minutesAgo } from './util';

/** Synthetic demo data. Phone numbers use the UK range reserved for drama and testing. */

const DEMO_PHONE = '+447700900123';

export function seedNotificationPreferences(policy: NotificationPolicy): NotificationPreferences {
  const allowed = (channels: DeliveryChannel[]) =>
    channels.filter((c) => policy.allowedChannels.includes(c));
  return {
    routing: {
      info: allowed(['in-app', 'email']),
      important: allowed(['in-app', 'push', 'email']),
      critical: allowed(['in-app', 'push', 'email', 'whatsapp', 'teams']),
    },
    quietHours: {
      mode: 'outside-session',
      start: '21:00',
      end: '06:30',
      weekends: true,
      allowCritical: true,
    },
    digest: { enabled: true, time: '17:30' },
    escalation: { enabled: true, afterMinutes: 5, notifySupervisor: true },
    privacy: 'minimal',
  };
}

export function seedContacts(user: User, policy: NotificationPolicy, now: number): Contact[] {
  const verifiedAt = minutesAgo(60 * 24 * 30, now);
  const contacts: Contact[] = [
    { channel: 'email', address: maskAddress('email', user.email), verifiedAt },
  ];
  if (policy.allowedChannels.includes('whatsapp')) {
    contacts.push({
      channel: 'whatsapp',
      address: maskAddress('whatsapp', DEMO_PHONE),
      verifiedAt,
      consentAt: verifiedAt,
    });
  }
  return contacts;
}

export function seedNotificationEvents(
  user: User,
  policy: NotificationPolicy,
  now: number,
): NotificationEvent[] {
  const email = maskAddress('email', user.email);
  const phone = maskAddress('whatsapp', DEMO_PHONE);
  const whatsapp = policy.allowedChannels.includes('whatsapp');
  const at = (minutes: number) => minutesAgo(minutes, now);
  const outage = 60 * 50;

  const events: NotificationEvent[] = [
    {
      id: 'nev_release',
      ref: 'NT-7Q2M4K',
      topic: 'release',
      urgency: 'important',
      title: 'Release in 10 minutes',
      body: 'USD core PCE price index at 13:30. Your Rule 4 covers the 10 minutes either side.',
      href: '/desk',
      createdAt: at(12),
      deliveries: [
        { channel: 'in-app', status: 'read', at: at(12), escalation: false },
        { channel: 'push', status: 'delivered', at: at(12), to: 'Your phone', escalation: false },
        {
          channel: 'email',
          status: 'delivered',
          at: at(12),
          to: email,
          escalation: false,
        },
      ],
    },
    {
      id: 'nev_recap',
      ref: 'NT-K8D1RX',
      topic: 'approval',
      urgency: 'info',
      title: 'Session recap ready for approval',
      body: 'The email to Jordan Ellis is waiting for you. Nothing is sent until you approve.',
      href: '/approvals',
      createdAt: at(35),
      deliveries: [
        { channel: 'in-app', status: 'delivered', at: at(35), escalation: false },
        {
          channel: 'email',
          status: 'held',
          at: at(35),
          to: email,
          note: 'Bundled into your 17:30 summary',
          escalation: false,
        },
      ],
    },
    {
      id: 'nev_brief',
      ref: 'NT-B4W9TE',
      topic: 'briefing',
      urgency: 'info',
      title: 'Your morning brief is ready',
      body: '5 releases today, 3 of them high impact. Daily loss 0% of 5% used. 2 items waiting for your approval.',
      href: '/notifications?tab=briefings',
      createdAt: at(60 * 3),
      acknowledgedAt: at(60 * 3 - 9),
      acknowledgedVia: 'in-app',
      deliveries: [
        { channel: 'in-app', status: 'read', at: at(60 * 3), escalation: false },
        { channel: 'email', status: 'read', at: at(60 * 3), to: email, escalation: false },
        ...(whatsapp
          ? [
              {
                channel: 'whatsapp' as const,
                status: 'read' as const,
                at: at(60 * 3),
                to: phone,
                escalation: false,
              },
            ]
          : []),
      ],
    },
    {
      id: 'nev_workflow',
      ref: 'NT-H3ZP6N',
      topic: 'automation',
      urgency: 'important',
      title: 'Workflow stopped instead of guessing',
      body: 'Swap rates to costs sheet: the broker page layout changed, so the figures could not be read reliably.',
      href: '/workflows/aut_swaps',
      createdAt: at(190),
      acknowledgedAt: at(171),
      acknowledgedVia: 'in-app',
      deliveries: [
        { channel: 'in-app', status: 'read', at: at(190), escalation: false },
        { channel: 'push', status: 'delivered', at: at(190), to: 'Your phone', escalation: false },
        { channel: 'email', status: 'delivered', at: at(190), to: email, escalation: false },
      ],
    },
    {
      id: 'nev_session',
      ref: 'NT-M6R8FA',
      topic: 'session-rule',
      urgency: 'important',
      title: 'Trade outside your session rule',
      body: 'EURUSD short opened at 16:42, after your 16:30 session end (Rule 2).',
      href: '/alerts',
      createdAt: at(60 * 21),
      acknowledgedAt: at(60 * 21 - 3),
      acknowledgedVia: 'push',
      deliveries: [
        { channel: 'in-app', status: 'read', at: at(60 * 21), escalation: false },
        {
          channel: 'push',
          status: 'read',
          at: at(60 * 21),
          to: 'Your phone',
          escalation: false,
        },
        {
          channel: 'email',
          status: 'held',
          at: at(60 * 21),
          to: email,
          note: 'Quiet hours: held for your 17:30 summary',
          escalation: false,
        },
      ],
    },
    {
      id: 'nev_dw',
      ref: 'NT-X2C5VJ',
      topic: 'source-health',
      urgency: 'critical',
      title: 'Data warehouse stopped fetching',
      body: 'The credentials expired, so new records are not coming in. Reconnect it in Connected sources to resume.',
      href: '/sources',
      createdAt: at(outage),
      acknowledgedAt: at(outage - 14),
      acknowledgedVia: 'push',
      deliveries: [
        { channel: 'in-app', status: 'delivered', at: at(outage), escalation: false },
        {
          channel: 'push',
          status: 'delivered',
          at: at(outage),
          to: 'Your phone',
          escalation: false,
        },
        { channel: 'email', status: 'delivered', at: at(outage), to: email, escalation: false },
        ...(whatsapp
          ? [
              {
                channel: 'whatsapp' as const,
                status: 'delivered' as const,
                at: at(outage),
                to: phone,
                escalation: false,
              },
            ]
          : []),
        {
          channel: 'push',
          status: 'read',
          at: at(outage - 5),
          to: 'Your phone',
          note: 'Repeated: not yet acknowledged',
          escalation: true,
        },
        {
          channel: 'email',
          status: 'delivered',
          at: at(outage - 5),
          to: policy.supervisorLabel,
          note: 'Escalated to your supervisor',
          escalation: true,
        },
      ],
      escalation: {
        status: 'sent',
        dueAt: at(outage - 5),
        target: `Every verified channel and ${policy.supervisorLabel}`,
      },
    },
  ];
  return events;
}

export function seedBriefings(policy: NotificationPolicy, now: number): BriefingSchedule[] {
  const allowed = (channels: DeliveryChannel[]) =>
    channels.filter((c) => policy.allowedChannels.includes(c));
  return [
    {
      kind: 'morning-brief',
      enabled: true,
      time: '07:30',
      days: [1, 2, 3, 4, 5],
      channels: allowed(['in-app', 'email', 'whatsapp']),
      sections: ['releases', 'limits', 'action-items', 'approvals', 'news', 'sources'],
      lastSentAt: minutesAgo(60 * 3, now),
    },
    {
      kind: 'end-of-day',
      enabled: true,
      time: '17:00',
      days: [1, 2, 3, 4, 5],
      channels: allowed(['in-app', 'email']),
      sections: ['session-summary', 'limits', 'journal', 'approvals', 'tomorrow'],
      lastSentAt: minutesAgo(60 * 20, now),
    },
  ];
}
