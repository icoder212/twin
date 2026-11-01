import { z } from 'zod';
import { sessionSchema } from '../domain/auth';
import { automationPlanSchema, automationRunSchema, automationSchema } from '../domain/automation';
import {
  alertSchema,
  approvalSchema,
  auditEventSchema,
  connectedSourceSchema,
  notificationSchema,
  shortcutSchema,
} from '../domain/operations';
import {
  briefingScheduleSchema,
  briefingSchema,
  contactSchema,
  notificationEventSchema,
  notificationPolicySchema,
  notificationPreferencesSchema,
  verificationChallengeSchema,
} from '../domain/notifications';
import { deskOverviewSchema } from '../domain/overview';
import { suggestionSchema, twinStreamEventSchema } from '../domain/twin';
import type { TwinDeskApi } from './contracts';
import { readEventStream } from './event-stream';
import { createHttpClient, type HttpClientOptions } from './http-client';

const voidSchema = z.unknown().transform(() => undefined);
const loginResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('mfa-required'),
    challengeId: z.string(),
    maskedDestination: z.string(),
    method: z.enum(['totp', 'sms']),
  }),
  z.object({ status: z.literal('authenticated'), session: sessionSchema }),
]);

const id = (value: string) => encodeURIComponent(value);

/**
 * The production adapter: the same contract as the mock, over HTTPS. The REST surface below is
 * the specification for the backend team; see docs/ARCHITECTURE.md.
 */
export function createHttpApi(options: HttpClientOptions): TwinDeskApi {
  const http = createHttpClient(options);

  return {
    auth: {
      login: (body) =>
        http.request('/v1/auth/login', { method: 'POST', body, schema: loginResultSchema }),
      verifyMfa: (body) =>
        http.request('/v1/auth/mfa', { method: 'POST', body, schema: sessionSchema }),
      startSso: (provider) =>
        http.request(`/v1/auth/sso/${id(provider)}`, { method: 'POST', schema: loginResultSchema }),
      getSession: () => http.request('/v1/auth/session', { schema: sessionSchema.nullable() }),
      touch: () => http.request('/v1/auth/touch', { method: 'POST', schema: voidSchema }),
      logout: (reason) =>
        http.request('/v1/auth/logout', { method: 'POST', body: { reason }, schema: voidSchema }),
    },
    twin: {
      async *ask(request, signal) {
        const response = await http.stream('/v1/twin/ask', request, signal);
        if (!response.body) throw new Error('The answer stream had no body');
        yield* readEventStream(response.body, twinStreamEventSchema);
      },
      suggestions: (deskType) =>
        http.request(`/v1/twin/suggestions?desk=${id(deskType)}`, {
          schema: z.array(suggestionSchema),
        }),
      feedback: (answerId, rating) =>
        http.request(`/v1/twin/answers/${id(answerId)}/feedback`, {
          method: 'POST',
          body: { rating },
          schema: voidSchema,
        }),
    },
    desk: {
      overview: () => http.request('/v1/desk/overview', { schema: deskOverviewSchema }),
      setActionItemDone: (itemId, done) =>
        http.request(`/v1/desk/action-items/${id(itemId)}`, {
          method: 'PATCH',
          body: { done },
          schema: voidSchema,
        }),
      setDeskType: (deskType) =>
        http.request('/v1/desk/type', { method: 'PUT', body: { deskType }, schema: sessionSchema }),
    },
    automations: {
      list: (kind) =>
        http.request(`/v1/automations${kind ? `?kind=${id(kind)}` : ''}`, {
          schema: z.array(automationSchema),
        }),
      get: (automationId) =>
        http.request(`/v1/automations/${id(automationId)}`, { schema: automationSchema }),
      runs: (automationId) =>
        http.request(`/v1/automations/${id(automationId)}/runs`, {
          schema: z.array(automationRunSchema),
        }),
      plan: (body) =>
        http.request('/v1/automations/plan', {
          method: 'POST',
          body,
          schema: automationPlanSchema,
          timeoutMs: 60_000,
        }),
      save: (draft) =>
        http.request(`/v1/automations/${id(draft.id)}`, {
          method: 'PUT',
          body: draft,
          schema: automationSchema,
        }),
      setStatus: (automationId, status) =>
        http.request(`/v1/automations/${id(automationId)}/status`, {
          method: 'PATCH',
          body: { status },
          schema: automationSchema,
        }),
      run: (automationId) =>
        http.request(`/v1/automations/${id(automationId)}/runs`, {
          method: 'POST',
          schema: automationRunSchema,
        }),
    },
    shortcuts: {
      list: () => http.request('/v1/shortcuts', { schema: z.array(shortcutSchema) }),
      remove: (shortcutId) =>
        http.request(`/v1/shortcuts/${id(shortcutId)}`, { method: 'DELETE', schema: voidSchema }),
    },
    alerts: {
      list: () => http.request('/v1/alerts', { schema: z.array(alertSchema) }),
      create: (body) => http.request('/v1/alerts', { method: 'POST', body, schema: alertSchema }),
      setStatus: (alertId, status) =>
        http.request(`/v1/alerts/${id(alertId)}/status`, {
          method: 'PATCH',
          body: { status },
          schema: alertSchema,
        }),
      remove: (alertId) =>
        http.request(`/v1/alerts/${id(alertId)}`, { method: 'DELETE', schema: voidSchema }),
      notifications: () =>
        http.request('/v1/notifications', { schema: z.array(notificationSchema) }),
      markRead: (ids) =>
        http.request('/v1/notifications/read', {
          method: 'POST',
          body: { ids },
          schema: voidSchema,
        }),
    },
    approvals: {
      list: () => http.request('/v1/approvals', { schema: z.array(approvalSchema) }),
      decide: ({ id: approvalId, ...body }) =>
        http.request(`/v1/approvals/${id(approvalId)}/decision`, {
          method: 'POST',
          body,
          schema: approvalSchema,
        }),
    },
    sources: {
      list: () => http.request('/v1/sources', { schema: z.array(connectedSourceSchema) }),
      connect: ({ sourceId, ...body }) =>
        http.request(`/v1/sources/${id(sourceId)}/connect`, {
          method: 'POST',
          body,
          schema: connectedSourceSchema,
        }),
      revoke: (sourceId) =>
        http.request(`/v1/sources/${id(sourceId)}/revoke`, {
          method: 'POST',
          schema: connectedSourceSchema,
        }),
      sync: (sourceId) =>
        http.request(`/v1/sources/${id(sourceId)}/sync`, {
          method: 'POST',
          schema: connectedSourceSchema,
        }),
      setAlertOnDisconnect: (sourceId, enabled) =>
        http.request(`/v1/sources/${id(sourceId)}/alerting`, {
          method: 'PATCH',
          body: { enabled },
          schema: connectedSourceSchema,
        }),
    },
    notifications: {
      preferences: () =>
        http.request('/v1/notifications/preferences', { schema: notificationPreferencesSchema }),
      updatePreferences: (body) =>
        http.request('/v1/notifications/preferences', {
          method: 'PUT',
          body,
          schema: notificationPreferencesSchema,
        }),
      contacts: () =>
        http.request('/v1/notifications/contacts', { schema: z.array(contactSchema) }),
      startVerification: (body) =>
        http.request('/v1/notifications/contacts/verify', {
          method: 'POST',
          body,
          schema: verificationChallengeSchema,
        }),
      confirmVerification: (body) =>
        http.request('/v1/notifications/contacts/verify/confirm', {
          method: 'POST',
          body,
          schema: contactSchema,
        }),
      removeContact: (channel) =>
        http.request(`/v1/notifications/contacts/${id(channel)}`, {
          method: 'DELETE',
          schema: voidSchema,
        }),
      policy: () => http.request('/v1/notifications/policy', { schema: notificationPolicySchema }),
      updatePolicy: (body) =>
        http.request('/v1/notifications/policy', {
          method: 'PUT',
          body,
          schema: notificationPolicySchema,
        }),
      events: () =>
        http.request('/v1/notifications/events', { schema: z.array(notificationEventSchema) }),
      acknowledge: (eventId) =>
        http.request(`/v1/notifications/events/${id(eventId)}/acknowledge`, {
          method: 'POST',
          schema: notificationEventSchema,
        }),
      sendTest: (urgency) =>
        http.request('/v1/notifications/test', {
          method: 'POST',
          body: { urgency },
          schema: notificationEventSchema,
        }),
    },
    briefings: {
      list: () => http.request('/v1/briefings', { schema: z.array(briefingScheduleSchema) }),
      update: ({ kind, ...body }) =>
        http.request(`/v1/briefings/${id(kind)}`, {
          method: 'PUT',
          body,
          schema: briefingScheduleSchema,
        }),
      preview: (kind) =>
        http.request(`/v1/briefings/${id(kind)}/preview`, { schema: briefingSchema }),
      sendNow: (kind) =>
        http.request(`/v1/briefings/${id(kind)}/send`, {
          method: 'POST',
          schema: notificationEventSchema,
        }),
    },
    audit: {
      list: (query) =>
        http.request(
          `/v1/audit?${new URLSearchParams(Object.entries(query).filter(([, v]) => v != null) as [string, string][])}`,
          {
            schema: z.object({ items: z.array(auditEventSchema), total: z.number().int() }),
          },
        ),
      exportCsv: (query) =>
        http.request(
          `/v1/audit/export?${new URLSearchParams(Object.entries(query).filter(([, v]) => v != null) as [string, string][])}`,
          {
            schema: z.object({ filename: z.string().max(200), content: z.string() }),
            timeoutMs: 60_000,
          },
        ),
    },
  };
}
