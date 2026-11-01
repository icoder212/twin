import type { AuditQuery, AutomationKind, BriefingKind, DeskType } from '@twindesk/core';

/** Every cache key in one place, so invalidation after a mutation is predictable. */
export const qk = {
  overview: ['desk', 'overview'] as const,
  suggestions: (desk: DeskType) => ['twin', 'suggestions', desk] as const,
  automations: (kind?: AutomationKind) => ['automations', 'list', kind ?? 'all'] as const,
  automationsRoot: ['automations'] as const,
  automation: (id: string) => ['automations', 'detail', id] as const,
  runs: (id: string) => ['automations', 'runs', id] as const,
  shortcuts: ['shortcuts'] as const,
  alerts: ['alerts'] as const,
  notifications: ['notifications'] as const,
  approvals: ['approvals'] as const,
  sources: ['sources'] as const,
  notifyRoot: ['notify'] as const,
  notificationPrefs: ['notify', 'preferences'] as const,
  contacts: ['notify', 'contacts'] as const,
  notificationPolicy: ['notify', 'policy'] as const,
  notificationEvents: ['notify', 'events'] as const,
  briefings: ['notify', 'briefings'] as const,
  briefingPreview: (kind: BriefingKind) => ['notify', 'briefing-preview', kind] as const,
  audit: (query: AuditQuery) => ['audit', query] as const,
  auditRoot: ['audit'] as const,
};
