import {
  ROLE_LABELS,
  type AuditAction,
  type AuditEvent,
  type AuditQuery,
  type Tone,
} from '@twindesk/core';

export const OUTCOME_TONE: Record<AuditEvent['outcome'], Tone> = {
  success: 'success',
  failure: 'danger',
  blocked: 'warning',
};

export const OUTCOME_LABEL: Record<AuditEvent['outcome'], string> = {
  success: 'Success',
  failure: 'Failure',
  blocked: 'Blocked',
};

export const ACTION_GROUP_LABELS: Record<AuditQuery['action'], string> = {
  all: 'All activity',
  auth: 'Sign-in and sessions',
  twin: 'Twin answers',
  approval: 'Approvals',
  automation: 'Tasks and workflows',
  source: 'Connected sources',
  alert: 'Alerts',
  notification: 'Notifications',
  settings: 'Settings',
  data: 'Data exports',
};

/** Plain names for each action; the code stays visible next to it for compliance. */
export const ACTION_LABELS: Record<AuditAction, string> = {
  'auth.login': 'Signed in',
  'auth.logout': 'Signed out',
  'auth.failed': 'Sign-in failed',
  'auth.mfa': 'Authenticator code',
  'auth.timeout': 'Session ended',
  'twin.answer': 'Answer given',
  'twin.refused': 'Question declined',
  'twin.withheld': 'Answer withheld',
  'approval.approved': 'Approved',
  'approval.rejected': 'Rejected',
  'automation.created': 'Automation created',
  'automation.run': 'Automation ran',
  'automation.paused': 'Automation paused',
  'source.connected': 'Source connected',
  'source.revoked': 'Source revoked',
  'alert.created': 'Alert set',
  'alert.removed': 'Alert removed',
  'settings.changed': 'Settings changed',
  'data.exported': 'Data exported',
  'notification.sent': 'Notification sent',
  'notification.escalated': 'Notification escalated',
  'notification.acknowledged': 'Notification acknowledged',
  'notification.settings-changed': 'Notification settings changed',
  'notification.policy-changed': 'Firm notification policy changed',
  'notification.contact-verified': 'Contact verified',
  'notification.contact-removed': 'Contact removed',
};

export const OUTCOME_FILTER_LABELS: Record<AuditQuery['outcome'], string> = {
  all: 'Any outcome',
  success: 'Success',
  failure: 'Failure',
  blocked: 'Blocked',
};

export function actorRoleLabel(role: AuditEvent['actor']['role']): string {
  if (role === 'twin') return 'Twin';
  if (role === 'system') return 'System';
  return ROLE_LABELS[role];
}

export function actorRoleTone(role: AuditEvent['actor']['role']): Tone {
  if (role === 'twin') return 'brand';
  if (role === 'system') return 'neutral';
  return role === 'compliance' || role === 'admin' ? 'info' : 'neutral';
}
