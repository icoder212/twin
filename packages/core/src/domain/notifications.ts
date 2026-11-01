import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common';

/**
 * Notifications that leave the app. Every message states facts the user or the firm set up
 * (a limit, a level, a release time) and never suggests a trade. Every delivery is logged.
 */

// ---------------------------------------------------------------------------
// Urgency and channels
// ---------------------------------------------------------------------------

export const URGENCIES = ['info', 'important', 'critical'] as const;
export const urgencySchema = z.enum(URGENCIES);
export type Urgency = z.infer<typeof urgencySchema>;

export const URGENCY_LABELS: Record<Urgency, { label: string; examples: string }> = {
  info: { label: 'Info', examples: 'Approvals waiting, recaps ready, a sync finished' },
  important: { label: 'Important', examples: 'A limit at 80%, a release in 15 minutes' },
  critical: {
    label: 'Critical',
    examples: 'A limit at 95%, a source down during your session',
  },
};

export const DELIVERY_CHANNELS = ['in-app', 'push', 'email', 'whatsapp', 'teams', 'sms'] as const;
export const deliveryChannelSchema = z.enum(DELIVERY_CHANNELS);
export type DeliveryChannel = z.infer<typeof deliveryChannelSchema>;

export const CHANNEL_LABELS: Record<DeliveryChannel, string> = {
  'in-app': 'In the app',
  push: 'Phone push',
  email: 'Email',
  whatsapp: 'WhatsApp',
  teams: 'Microsoft Teams',
  sms: 'Text message',
};

/** Channels that leave the app and need an address the user has verified. */
export const CONTACT_CHANNELS = ['email', 'whatsapp', 'teams', 'sms'] as const;
export const contactChannelSchema = z.enum(CONTACT_CHANNELS);
export type ContactChannel = z.infer<typeof contactChannelSchema>;

export function isContactChannel(channel: DeliveryChannel): channel is ContactChannel {
  return (CONTACT_CHANNELS as readonly string[]).includes(channel);
}

/** The trading session used for "outside my session" quiet hours until the rule engine supplies it. */
export const DEFAULT_SESSION_HOURS = { start: '07:00', end: '16:30' } as const;

const hhmmSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour time such as 07:30');

// ---------------------------------------------------------------------------
// Firm policy: which channels a firm allows, set by an administrator
// ---------------------------------------------------------------------------

export const notificationPolicySchema = z.object({
  /** Channels the firm allows. The app itself is always allowed. */
  allowedChannels: z.array(deliveryChannelSchema),
  /** Forces minimal wording (no figures or account details) on every message that leaves the app. */
  requireMinimalContent: z.boolean(),
  /** Lets unacknowledged critical alerts go to a named supervisor or desk. */
  allowSupervisorEscalation: z.boolean(),
  supervisorLabel: z.string().max(60),
  updatedAt: isoDateTimeSchema.optional(),
  updatedBy: z.string().max(120).optional(),
});
export type NotificationPolicy = z.infer<typeof notificationPolicySchema>;

export const notificationPolicyInputSchema = notificationPolicySchema.pick({
  allowedChannels: true,
  requireMinimalContent: true,
  allowSupervisorEscalation: true,
});
export type NotificationPolicyInput = z.infer<typeof notificationPolicyInputSchema>;

// ---------------------------------------------------------------------------
// Personal preferences
// ---------------------------------------------------------------------------

export const messagePrivacySchema = z.enum(['minimal', 'standard']);
export type MessagePrivacy = z.infer<typeof messagePrivacySchema>;

export const quietModeSchema = z.enum(['off', 'outside-session', 'custom']);
export type QuietMode = z.infer<typeof quietModeSchema>;

export const notificationPreferencesSchema = z.object({
  /** Channels per urgency. The app is always included, whatever is chosen here. */
  routing: z.object({
    info: z.array(deliveryChannelSchema),
    important: z.array(deliveryChannelSchema),
    critical: z.array(deliveryChannelSchema),
  }),
  quietHours: z.object({
    mode: quietModeSchema,
    start: hhmmSchema,
    end: hhmmSchema,
    /** Saturday and Sunday are quiet all day. */
    weekends: z.boolean(),
    /** Critical alerts still come through during quiet hours. */
    allowCritical: z.boolean(),
  }),
  /** Info messages for outside channels are bundled into one summary a day. */
  digest: z.object({ enabled: z.boolean(), time: hhmmSchema }),
  escalation: z.object({
    enabled: z.boolean(),
    afterMinutes: z.number().int().min(1).max(60),
    /** Also tell the firm's supervisor or desk, where the firm allows it. */
    notifySupervisor: z.boolean(),
  }),
  privacy: messagePrivacySchema,
});
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

// ---------------------------------------------------------------------------
// Contacts: verified addresses for channels outside the app
// ---------------------------------------------------------------------------

export const contactSchema = z.object({
  channel: contactChannelSchema,
  /** Masked for display; the full address stays on the server. */
  address: z.string().max(80),
  verifiedAt: isoDateTimeSchema,
  /** WhatsApp and text messages need recorded consent. */
  consentAt: isoDateTimeSchema.optional(),
});
export type Contact = z.infer<typeof contactSchema>;

/** International format, e.g. +447700900123. Spaces, dashes and brackets are removed. */
const phoneSchema = z
  .string()
  .trim()
  .max(24)
  .transform((v) => v.replace(/[\s().-]/g, ''))
  .pipe(
    z.string().regex(/^\+[1-9]\d{7,14}$/, 'Use the international format, e.g. +44 7700 900123'),
  );

const consentSchema = z.literal(true, {
  error: 'Confirm you agree to receive notifications here',
});

export const startVerificationInputSchema = z.discriminatedUnion('channel', [
  z.object({
    channel: z.literal('email'),
    address: z.email('Enter a valid email address').max(254),
  }),
  z.object({
    channel: z.literal('teams'),
    address: z.email('Enter your work account, e.g. you@firm.com').max(254),
  }),
  z.object({ channel: z.literal('whatsapp'), address: phoneSchema, consent: consentSchema }),
  z.object({ channel: z.literal('sms'), address: phoneSchema, consent: consentSchema }),
]);
export type StartVerificationInput = z.input<typeof startVerificationInputSchema>;

export const verificationChallengeSchema = z.object({
  verificationId: idSchema,
  channel: contactChannelSchema,
  maskedDestination: z.string().max(80),
  expiresAt: isoDateTimeSchema,
});
export type VerificationChallenge = z.infer<typeof verificationChallengeSchema>;

export const confirmVerificationInputSchema = z.object({
  verificationId: idSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code'),
});
export type ConfirmVerificationInput = z.infer<typeof confirmVerificationInputSchema>;

// ---------------------------------------------------------------------------
// Delivery log
// ---------------------------------------------------------------------------

export const NOTIFICATION_TOPICS = [
  'price',
  'loss-limit',
  'release',
  'session-rule',
  'source-health',
  'approval',
  'automation',
  'briefing',
  'test',
] as const;
export const notificationTopicSchema = z.enum(NOTIFICATION_TOPICS);
export type NotificationTopic = z.infer<typeof notificationTopicSchema>;

/** Neutral topic names, used as the whole message when content must be minimal. */
export const TOPIC_LABELS: Record<NotificationTopic, string> = {
  price: 'Price alert',
  'loss-limit': 'Loss limit alert',
  release: 'Release reminder',
  'session-rule': 'Session rule alert',
  'source-health': 'Data source alert',
  approval: 'Approval waiting',
  automation: 'Workflow update',
  briefing: 'Briefing ready',
  test: 'Test alert',
};

export const deliveryStatusSchema = z.enum(['delivered', 'read', 'held', 'skipped', 'failed']);
export type DeliveryStatus = z.infer<typeof deliveryStatusSchema>;

export const deliverySchema = z.object({
  channel: deliveryChannelSchema,
  status: deliveryStatusSchema,
  at: isoDateTimeSchema,
  /** Masked destination, e.g. "+44 ••• ••0123". */
  to: z.string().max(80).optional(),
  /** Why a delivery was held, skipped or failed, in plain words. */
  note: z.string().max(160).optional(),
  /** True for messages sent because nobody acknowledged the first ones. */
  escalation: z.boolean(),
});
export type Delivery = z.infer<typeof deliverySchema>;

export const notificationEventSchema = z.object({
  id: idSchema,
  /** Reference quoted in every message, e.g. NT-K7P2QA. */
  ref: z.string().regex(/^NT-[0-9A-Z]{6}$/),
  topic: notificationTopicSchema,
  urgency: urgencySchema,
  title: z.string().max(120),
  body: z.string().max(400),
  href: z.string().max(200).optional(),
  createdAt: isoDateTimeSchema,
  acknowledgedAt: isoDateTimeSchema.optional(),
  acknowledgedVia: deliveryChannelSchema.optional(),
  deliveries: z.array(deliverySchema),
  escalation: z
    .object({
      status: z.enum(['waiting', 'sent', 'cancelled']),
      dueAt: isoDateTimeSchema,
      /** Who or what receives the escalation, e.g. "Text message and Risk desk". */
      target: z.string().max(120),
    })
    .optional(),
});
export type NotificationEvent = z.infer<typeof notificationEventSchema>;

// ---------------------------------------------------------------------------
// Scheduled briefings
// ---------------------------------------------------------------------------

export const BRIEFING_KINDS = ['morning-brief', 'end-of-day'] as const;
export const briefingKindSchema = z.enum(BRIEFING_KINDS);
export type BriefingKind = z.infer<typeof briefingKindSchema>;

export const BRIEFING_SECTIONS = [
  'releases',
  'limits',
  'action-items',
  'approvals',
  'news',
  'sources',
  'session-summary',
  'journal',
  'tomorrow',
] as const;
export const briefingSectionSchema = z.enum(BRIEFING_SECTIONS);
export type BriefingSection = z.infer<typeof briefingSectionSchema>;

export const BRIEFING_META: Record<
  BriefingKind,
  { title: string; description: string; sections: BriefingSection[] }
> = {
  'morning-brief': {
    title: 'Morning brief',
    description: 'Your day on one page, before the session opens.',
    sections: ['releases', 'limits', 'action-items', 'approvals', 'news', 'sources'],
  },
  'end-of-day': {
    title: 'End-of-day recap',
    description: 'What happened today against your rules, and what is on tomorrow.',
    sections: ['session-summary', 'limits', 'journal', 'approvals', 'tomorrow'],
  },
};

export const BRIEFING_SECTION_LABELS: Record<BriefingSection, string> = {
  releases: 'Today’s releases',
  limits: 'Room under your limits',
  'action-items': 'Open action items',
  approvals: 'Waiting for your approval',
  news: 'News on your instruments',
  sources: 'Data source health',
  'session-summary': 'Today against your rules',
  journal: 'Journal prompts',
  tomorrow: 'Tomorrow’s releases',
};

export const briefingScheduleSchema = z.object({
  kind: briefingKindSchema,
  enabled: z.boolean(),
  time: hhmmSchema,
  /** 0 is Sunday. */
  days: z.array(z.number().int().min(0).max(6)).min(1, 'Pick at least one day').max(7),
  channels: z.array(deliveryChannelSchema).min(1, 'Pick at least one channel'),
  sections: z.array(briefingSectionSchema).min(1, 'Pick at least one section'),
  lastSentAt: isoDateTimeSchema.optional(),
  nextRunAt: isoDateTimeSchema.optional(),
});
export type BriefingSchedule = z.infer<typeof briefingScheduleSchema>;

export const updateBriefingInputSchema = briefingScheduleSchema.pick({
  kind: true,
  enabled: true,
  time: true,
  days: true,
  channels: true,
  sections: true,
});
export type UpdateBriefingInput = z.infer<typeof updateBriefingInputSchema>;

export const briefingSchema = z.object({
  kind: briefingKindSchema,
  title: z.string().max(80),
  generatedAt: isoDateTimeSchema,
  sections: z.array(
    z.object({
      id: briefingSectionSchema,
      heading: z.string().max(80),
      items: z.array(z.string().max(240)).max(12),
    }),
  ),
});
export type Briefing = z.infer<typeof briefingSchema>;
