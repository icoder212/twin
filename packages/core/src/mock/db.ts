import type { User } from '../domain/auth';
import type { DeskType } from '../domain/desk';
import type { Automation, AutomationRun } from '../domain/automation';
import type {
  Alert,
  Approval,
  AuditEvent,
  ConnectedSource,
  Notification,
  Shortcut,
} from '../domain/operations';
import type {
  BriefingSchedule,
  Contact,
  NotificationEvent,
  NotificationPolicy,
  NotificationPreferences,
} from '../domain/notifications';
import type { ActionItem } from '../domain/overview';
import type { TenantConfig } from '../domain/tenant';
import type { KeyValueStore } from '../storage/kv';
import {
  seedActionItems,
  seedAlerts,
  seedApprovals,
  seedAudit,
  seedAutomations,
  seedNotifications,
  seedShortcuts,
  seedSources,
} from './fixtures';
import {
  seedBriefings,
  seedContacts,
  seedNotificationEvents,
  seedNotificationPreferences,
} from './notify-fixtures';
import { DEMO_USERS } from './users';

export interface UserData {
  version: 2;
  deskType: DeskType;
  automations: Automation[];
  runs: Record<string, AutomationRun[]>;
  shortcuts: Shortcut[];
  alerts: Alert[];
  notifications: Notification[];
  approvals: Approval[];
  sources: ConnectedSource[];
  actionItems: ActionItem[];
  notes: Array<{ id: string; text: string; at: string }>;
  notify: {
    preferences: NotificationPreferences;
    contacts: Contact[];
    events: NotificationEvent[];
    briefings: BriefingSchedule[];
  };
}

const PREFIX = 'twindesk.mock.v1';
const MAX_AUDIT = 500;

/**
 * Demo persistence. Data is namespaced per tenant and per user, the same separation the real
 * data layer enforces with row-level security, so one user's twin can never read another's.
 */
export class MockDb {
  private cache = new Map<string, UserData>();
  private auditCache = new Map<string, AuditEvent[]>();
  private policyCache = new Map<string, NotificationPolicy>();

  constructor(
    private readonly store: KeyValueStore,
    private readonly now: () => Date,
    private readonly tenant: TenantConfig,
  ) {}

  private userKey(tenantId: string, userId: string) {
    return `${PREFIX}.${tenantId}.${userId}`;
  }

  private auditKey(tenantId: string) {
    return `${PREFIX}.${tenantId}.audit`;
  }

  private policyKey(tenantId: string) {
    return `${PREFIX}.${tenantId}.policy`;
  }

  /** The firm's notification policy: the tenant's defaults until an administrator changes it. */
  policy(): NotificationPolicy {
    const tenantId = this.tenant.id;
    const cached = this.policyCache.get(tenantId);
    if (cached) return cached;
    let policy: NotificationPolicy | undefined;
    const raw = this.store.get(this.policyKey(tenantId));
    if (raw) {
      try {
        policy = JSON.parse(raw) as NotificationPolicy;
      } catch {
        policy = undefined;
      }
    }
    policy ??= { ...this.tenant.notifications };
    this.policyCache.set(tenantId, policy);
    return policy;
  }

  savePolicy(policy: NotificationPolicy): void {
    this.policyCache.set(this.tenant.id, policy);
    this.store.set(this.policyKey(this.tenant.id), JSON.stringify(policy));
  }

  forUser(user: User): UserData {
    const key = this.userKey(user.tenantId, user.id);
    const cached = this.cache.get(key);
    if (cached) return cached;
    let data: UserData | undefined;
    const raw = this.store.get(key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as UserData;
        if (parsed.version === 2) data = parsed;
      } catch {
        // Corrupt demo state: reseed below.
      }
    }
    data ??= this.seed(user);
    this.cache.set(key, data);
    return data;
  }

  save(user: User): void {
    const key = this.userKey(user.tenantId, user.id);
    const data = this.cache.get(key);
    if (data) this.store.set(key, JSON.stringify(data));
  }

  audit(tenantId: string): AuditEvent[] {
    const cached = this.auditCache.get(tenantId);
    if (cached) return cached;
    let events: AuditEvent[] | undefined;
    const raw = this.store.get(this.auditKey(tenantId));
    if (raw) {
      try {
        events = JSON.parse(raw) as AuditEvent[];
      } catch {
        events = undefined;
      }
    }
    events ??= seedAudit(tenantId, DEMO_USERS, this.now().getTime());
    this.auditCache.set(tenantId, events);
    return events;
  }

  appendAudit(event: AuditEvent): void {
    const events = this.audit(event.tenantId);
    events.unshift(event);
    if (events.length > MAX_AUDIT) events.length = MAX_AUDIT;
    this.store.set(this.auditKey(event.tenantId), JSON.stringify(events));
  }

  /** Clears every demo record for a tenant: used by "Reset demo data" in settings. */
  reset(tenantId: string): void {
    for (const key of [...this.cache.keys()])
      if (key.startsWith(`${PREFIX}.${tenantId}.`)) this.cache.delete(key);
    this.auditCache.delete(tenantId);
    this.policyCache.delete(tenantId);
    for (const u of DEMO_USERS) this.store.remove(this.userKey(tenantId, u.id));
    this.store.remove(this.auditKey(tenantId));
    this.store.remove(this.policyKey(tenantId));
  }

  private seed(user: User): UserData {
    const now = this.now();
    const { automations, runs } = seedAutomations(user, now);
    const policy = this.policy();
    return {
      version: 2,
      deskType: user.deskType,
      automations,
      runs,
      shortcuts: seedShortcuts(now.getTime()),
      alerts: seedAlerts(now.getTime()),
      notifications: seedNotifications(now.getTime()),
      approvals: seedApprovals(user, now.getTime()),
      sources: seedSources(now.getTime()),
      actionItems: seedActionItems(),
      notes: [],
      notify: {
        preferences: seedNotificationPreferences(policy),
        contacts: seedContacts(user, policy, now.getTime()),
        events: seedNotificationEvents(user, policy, now.getTime()),
        briefings: seedBriefings(policy, now.getTime()),
      },
    };
  }
}
