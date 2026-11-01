import { ROLE_LABELS, type AuditEvent, type AuditQuery, type Tone } from '@twindesk/core';

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
  settings: 'Settings',
  data: 'Data exports',
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
