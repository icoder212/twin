import type { Role } from '../domain/auth';

export const PERMISSIONS = [
  'twin.ask',
  'tasks.manage',
  'workflows.manage',
  'shortcuts.manage',
  'alerts.manage',
  'approvals.decide',
  'sources.manage',
  'audit.read',
  'audit.export',
  'tenant.configure',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * Role to permission map. The client uses it to shape the UI; the server must enforce the same
 * map on every request, because anything in the browser can be changed by its user.
 */
const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  trader: new Set<Permission>([
    'twin.ask',
    'tasks.manage',
    'workflows.manage',
    'shortcuts.manage',
    'alerts.manage',
    'approvals.decide',
    'sources.manage',
    'audit.read',
  ]),
  support: new Set<Permission>(['twin.ask', 'approvals.decide', 'audit.read', 'shortcuts.manage']),
  compliance: new Set<Permission>(['twin.ask', 'approvals.decide', 'audit.read', 'audit.export']),
  admin: new Set<Permission>(PERMISSIONS),
};

export function can(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].has(permission);
}

export function permissionsFor(role: Role): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}
