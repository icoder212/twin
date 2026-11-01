import { z } from 'zod';
import { idSchema, isoDateTimeSchema, severitySchema } from './common';
import { complianceCheckResultSchema } from './twin';
import { roleSchema } from './auth';

// ---------------------------------------------------------------------------
// Shortcuts
// ---------------------------------------------------------------------------

export const shortcutCommandSchema = z
  .string()
  .regex(/^\/[a-z][a-z0-9-]{1,23}$/, 'Use a slash and 2 to 24 lowercase letters, e.g. /prep');

export const shortcutSchema = z.object({
  id: idSchema,
  command: shortcutCommandSchema,
  title: z.string().max(60),
  description: z.string().max(200),
  argsHint: z.string().max(40).optional(),
  automationId: idSchema.optional(),
  usageCount: z.number().int().nonnegative(),
  lastUsedAt: isoDateTimeSchema.optional(),
  builtIn: z.boolean(),
});
export type Shortcut = z.infer<typeof shortcutSchema>;

// ---------------------------------------------------------------------------
// Alerts and notifications
// ---------------------------------------------------------------------------

export const alertKindSchema = z.enum(['price', 'loss-limit', 'release', 'session-rule']);
export type AlertKind = z.infer<typeof alertKindSchema>;

export const alertChannelSchema = z.enum(['in-app', 'email', 'push']);
export type AlertChannel = z.infer<typeof alertChannelSchema>;

export const alertSchema = z.object({
  id: idSchema,
  kind: alertKindSchema,
  name: z.string().max(80),
  condition: z.string().max(200),
  instrument: z.string().max(20).optional(),
  level: z.number().optional(),
  thresholdPct: z.number().min(0).max(100).optional(),
  channels: z.array(alertChannelSchema).min(1),
  status: z.enum(['active', 'paused', 'triggered']),
  lastTriggeredAt: isoDateTimeSchema.optional(),
  createdAt: isoDateTimeSchema,
});
export type Alert = z.infer<typeof alertSchema>;

const instrumentSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9.]{3,12}$/, 'Use an instrument code such as EURUSD or XAUUSD');

export const createAlertInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('price'),
    instrument: instrumentSchema,
    level: z.coerce.number().positive('Level must be above zero').max(1_000_000),
    channels: z.array(alertChannelSchema).min(1, 'Pick at least one channel'),
  }),
  z.object({
    kind: z.literal('loss-limit'),
    thresholdPct: z.coerce.number().int().min(10).max(100),
    channels: z.array(alertChannelSchema).min(1, 'Pick at least one channel'),
  }),
  z.object({
    kind: z.literal('release'),
    minutesBefore: z.coerce.number().int().min(1).max(120),
    impact: z.enum(['high', 'medium']),
    channels: z.array(alertChannelSchema).min(1, 'Pick at least one channel'),
  }),
  z.object({
    kind: z.literal('session-rule'),
    channels: z.array(alertChannelSchema).min(1, 'Pick at least one channel'),
  }),
]);
export type CreateAlertInput = z.infer<typeof createAlertInputSchema>;

export const notificationSchema = z.object({
  id: idSchema,
  title: z.string().max(120),
  body: z.string().max(400),
  severity: severitySchema,
  at: isoDateTimeSchema,
  read: z.boolean(),
  href: z.string().max(200).optional(),
});
export type Notification = z.infer<typeof notificationSchema>;

// ---------------------------------------------------------------------------
// Approvals: anything leaving the desk for another person waits here.
// ---------------------------------------------------------------------------

export const approvalKindSchema = z.enum([
  'email',
  'message',
  'calendar-invite',
  'support-reply',
  'payout-check',
]);
export type ApprovalKind = z.infer<typeof approvalKindSchema>;

export const approvalSchema = z.object({
  id: idSchema,
  kind: approvalKindSchema,
  title: z.string().max(140),
  summary: z.string().max(300),
  recipients: z.array(z.object({ name: z.string().max(120), address: z.string().max(254) })),
  subject: z.string().max(200).optional(),
  body: z.string().max(8000),
  attachments: z.array(z.object({ name: z.string().max(120), size: z.string().max(20) })),
  origin: z.string().max(120),
  createdAt: isoDateTimeSchema,
  status: z.enum(['pending', 'approved', 'rejected']),
  decidedBy: z.string().max(120).optional(),
  decidedAt: isoDateTimeSchema.optional(),
  decisionNote: z.string().max(500).optional(),
  checks: z.array(complianceCheckResultSchema),
});
export type Approval = z.infer<typeof approvalSchema>;

export const approvalDecisionSchema = z.object({
  id: idSchema,
  decision: z.enum(['approved', 'rejected']),
  note: z.string().trim().max(500).optional(),
});
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;

// ---------------------------------------------------------------------------
// Connected sources: read-only by default, keys in a managed vault.
// ---------------------------------------------------------------------------

export const SOURCE_PROVIDERS = [
  'mt5',
  'ctrader',
  'dxtrade',
  'tradingview',
  'broker-api',
  'econ-calendar',
  'news-feed',
  'price-feed',
  'google-workspace',
  'microsoft-365',
  'journal',
  'documents',
  'rule-engine',
  'crm',
  'warehouse',
] as const;
export const sourceProviderSchema = z.enum(SOURCE_PROVIDERS);
export type SourceProvider = z.infer<typeof sourceProviderSchema>;

export const sourceCategorySchema = z.enum(['platform', 'market-data', 'your-day', 'firm-systems']);
export type SourceCategory = z.infer<typeof sourceCategorySchema>;

export const connectedSourceSchema = z.object({
  id: idSchema,
  provider: sourceProviderSchema,
  name: z.string().max(80),
  category: sourceCategorySchema,
  description: z.string().max(200),
  status: z.enum(['connected', 'syncing', 'error', 'not-connected']),
  authMethod: z.enum(['api-key', 'oauth', 'file-upload']),
  access: z.enum(['read-only', 'scoped-write']),
  scopes: z.array(z.string().max(80)),
  lastSyncAt: isoDateTimeSchema.optional(),
  recordCount: z.number().int().nonnegative().optional(),
  /** Hours since the last successful fetch above which data is marked stale. */
  staleAfterHours: z.number().positive(),
  errorMessage: z.string().max(300).optional(),
});
export type ConnectedSource = z.infer<typeof connectedSourceSchema>;

export const connectSourceInputSchema = z.object({
  sourceId: idSchema,
  label: z.string().trim().min(2, 'Give the connection a name').max(60),
  /** Only ever sent to the vault endpoint; never stored in client state or logs. */
  apiKey: z
    .string()
    .trim()
    .min(16, 'That key looks too short')
    .max(512, 'That key looks too long')
    .regex(/^[\x21-\x7E]+$/, 'Keys cannot contain spaces or unusual characters')
    .optional(),
  confirmReadOnly: z.literal(true, { error: 'Confirm the key is read-only' }),
});
export type ConnectSourceInput = z.infer<typeof connectSourceInputSchema>;

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

export const AUDIT_ACTIONS = [
  'auth.login',
  'auth.logout',
  'auth.failed',
  'auth.mfa',
  'auth.timeout',
  'twin.answer',
  'twin.refused',
  'twin.withheld',
  'approval.approved',
  'approval.rejected',
  'automation.created',
  'automation.run',
  'automation.paused',
  'source.connected',
  'source.revoked',
  'alert.created',
  'alert.removed',
  'settings.changed',
  'data.exported',
] as const;
export const auditActionSchema = z.enum(AUDIT_ACTIONS);
export type AuditAction = z.infer<typeof auditActionSchema>;

export const auditEventSchema = z.object({
  id: idSchema,
  at: isoDateTimeSchema,
  actor: z.object({
    id: z.string().max(64),
    name: z.string().max(120),
    role: roleSchema.or(z.literal('twin')).or(z.literal('system')),
  }),
  action: auditActionSchema,
  outcome: z.enum(['success', 'failure', 'blocked']),
  summary: z.string().max(300),
  /** Answer id, approval id, automation id and so on. */
  ref: z.string().max(64).optional(),
  tenantId: idSchema,
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

export const auditQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  action: z
    .enum(['all', 'auth', 'twin', 'approval', 'automation', 'source', 'alert', 'settings', 'data'])
    .default('all'),
  outcome: z.enum(['all', 'success', 'failure', 'blocked']).default('all'),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;
