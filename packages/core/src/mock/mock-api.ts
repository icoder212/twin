import type { TwinDeskApi } from '../api/contracts';
import { ApiError } from '../api/errors';
import { ADVICE_CHECKS } from '../compliance/advice-checks';
import {
  loginInputSchema,
  mfaInputSchema,
  sessionSchema,
  type LoginResult,
  type Session,
  type User,
} from '../domain/auth';
import {
  automationSchema,
  planRequestSchema,
  type Automation,
  type AutomationRun,
} from '../domain/automation';
import type { DeskType } from '../domain/desk';
import {
  approvalDecisionSchema,
  auditQuerySchema,
  connectSourceInputSchema,
  createAlertInputSchema,
  type Alert,
  type Approval,
  type AuditAction,
  type AuditEvent,
  type AuditQuery,
  type ConnectedSource,
} from '../domain/operations';
import type { TenantConfig } from '../domain/tenant';
import type { Suggestion, TwinStreamEvent } from '../domain/twin';
import { redactPii } from '../security/pii';
import { can, type Permission } from '../security/rbac';
import { createId } from '../security/ids';
import { sanitizeText, toCsvCell } from '../security/sanitize';
import type { KeyValueStore } from '../storage/kv';
import { MockDb } from './db';
import { buildRoutine, buildRuleWatch, ECONOMIC_EVENTS, seedNews } from './fixtures';
import { planAutomation } from './planner';
import type { ScenarioContext } from './scenarios';
import { runTwin } from './twin-engine';
import { DEMO_MFA_CODE, DEMO_PASSWORD, DEMO_USERS } from './users';
import { parseInput, seededRandom, sleep, notFound } from './util';

export interface MockApiOptions {
  tenant: TenantConfig;
  /** Persists the demo session and data. Use sessionStorage on web so it clears with the tab. */
  store: KeyValueStore;
  /** 1 gives realistic latency for demos; 0 makes every call instant (tests). */
  speed?: number;
  now?: () => Date;
}

const SESSION_KEY = 'twindesk.mock.session';
const LOCKOUT_PREFIX = 'twindesk.mock.lockout.';
const LOCKOUT_SECONDS = 60;
const MFA_TTL_MS = 5 * 60_000;
const MAX_MFA_ATTEMPTS = 5;

interface StoredSession {
  session: Session;
  lastActivity: number;
}

const DEFAULT_SCOPES: Record<string, string[]> = {
  'api-key': ['Account history (read)', 'Positions (read)'],
  oauth: ['Profile', 'Read access the task needs'],
  'file-upload': ['Uploaded files'],
};

const SUGGESTIONS: Record<DeskType | 'common', Suggestion[]> = {
  common: [
    {
      id: 'sg_shortcut',
      label: 'Run a shortcut',
      prompt: '/prep',
      kind: 'shortcut',
      hint: 'rules, trades and events as one checklist',
    },
    {
      id: 'sg_task',
      label: 'Build a task',
      prompt: 'Fridays at 5pm, review my week against my rules and email the summary to my coach.',
      kind: 'task',
      hint: 'Fridays at 5pm: your week reviewed against your rules',
    },
    {
      id: 'sg_workflow',
      label: 'Run a workflow',
      prompt:
        'When my broker updates its swap rates page, read it, compare with last week, and update my costs sheet.',
      kind: 'workflow',
      hint: 'Broker swap rates page into your costs sheet',
    },
    {
      id: 'sg_alert',
      label: 'Set an alert',
      prompt: '/alert EURUSD 1.0900',
      kind: 'alert',
      hint: 'a price alert at the level you type',
    },
    {
      id: 'sg_approve',
      label: 'Approve before send',
      prompt: '/recap',
      kind: 'approve',
      hint: 'session summary to your coach, once you approve',
    },
    {
      id: 'sg_break',
      label: 'Try to break it',
      prompt: 'Should I buy EURUSD now?',
      kind: 'break',
      hint: 'Ask it for a trade and watch it refuse',
    },
  ],
  'independent-trader': [
    {
      id: 'sg_ask',
      label: 'Ask with sources',
      prompt: 'Can my MT5 strategy be automated?',
      kind: 'ask',
      hint: '“Can my MT5 strategy be automated?”',
    },
  ],
  'prop-firm': [
    {
      id: 'sg_ask',
      label: 'Ask with sources',
      prompt: 'How do you prove a drawdown breach?',
      kind: 'ask',
      hint: '“How do you prove a drawdown breach?”',
    },
  ],
  broker: [
    {
      id: 'sg_ask',
      label: 'Ask with sources',
      prompt: 'What would our compliance lead need to sign?',
      kind: 'ask',
      hint: '“What would our compliance lead need to sign?”',
    },
  ],
  'trading-education': [
    {
      id: 'sg_ask',
      label: 'Ask with sources',
      prompt: 'How do you stop an AI chart feature giving advice?',
      kind: 'ask',
      hint: '“How do you stop an AI chart feature giving advice?”',
    },
  ],
  'fintech-engineering': [
    {
      id: 'sg_ask',
      label: 'Ask with sources',
      prompt: 'What would a twin need to answer our clients’ account questions?',
      kind: 'ask',
      hint: '“What would a twin need to answer our clients’ account questions?”',
    },
  ],
  'research-quant': [
    {
      id: 'sg_ask',
      label: 'Ask with sources',
      prompt: 'What does Consumer Duty mean for AI chart summaries?',
      kind: 'ask',
      hint: '“What does Consumer Duty mean for AI chart summaries?”',
    },
  ],
};

/**
 * In-memory implementation of the full API contract, with the behaviours the real backend must
 * have: input validation, permission checks, per-user data, lockout, MFA, audit and redaction.
 */
export function createMockApi(options: MockApiOptions): TwinDeskApi & { resetDemoData(): void } {
  const { tenant, store } = options;
  const speed = options.speed ?? 1;
  const now = options.now ?? (() => new Date());
  const db = new MockDb(store, now);
  const rand = seededRandom(7);
  const challenges = new Map<string, { userId: string; expiresAt: number; attempts: number }>();

  const latency = (min = 150, spread = 350) => sleep((min + rand() * spread) * speed);

  // -------------------------------------------------------------------------
  // Session helpers
  // -------------------------------------------------------------------------

  function readStored(): StoredSession | null {
    const raw = store.get(SESSION_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as StoredSession;
      const session = sessionSchema.safeParse(parsed.session);
      if (!session.success || typeof parsed.lastActivity !== 'number') return null;
      return { session: session.data, lastActivity: parsed.lastActivity };
    } catch {
      return null;
    }
  }

  function writeStored(value: StoredSession) {
    store.set(SESSION_KEY, JSON.stringify(value));
  }

  function currentSession(): Session | null {
    const stored = readStored();
    if (!stored) return null;
    const t = now().getTime();
    const idleMs = tenant.security.idleTimeoutMinutes * 60_000;
    if (
      stored.session.user.tenantId !== tenant.id ||
      t >= stored.session.expiresAt ||
      t - stored.lastActivity >= idleMs
    ) {
      store.remove(SESSION_KEY);
      audit(
        stored.session.user,
        'auth.timeout',
        'success',
        'Session ended after inactivity or expiry',
      );
      return null;
    }
    return stored.session;
  }

  function requireSession(permission?: Permission): Session {
    const session = currentSession();
    if (!session)
      throw new ApiError('unauthenticated', 'Your session has ended. Please sign in again.', {
        status: 401,
      });
    if (permission && !can(session.user.role, permission)) {
      throw new ApiError('forbidden', 'You do not have access to this.', { status: 403 });
    }
    return session;
  }

  function userFor(base: (typeof DEMO_USERS)[number]): User {
    const user: User = { ...base, tenantId: tenant.id };
    return { ...user, deskType: db.forUser(user).deskType };
  }

  function createSession(user: User, authMethod: Session['authMethod']): Session {
    const issuedAt = now().getTime();
    const session: Session = {
      sessionId: createId('ses'),
      user,
      issuedAt,
      expiresAt: issuedAt + tenant.security.absoluteSessionHours * 3_600_000,
      mfaVerified: true,
      authMethod,
    };
    writeStored({ session, lastActivity: issuedAt });
    return session;
  }

  function audit(
    actor: Pick<User, 'id' | 'name' | 'role'> | AuditEvent['actor'],
    action: AuditAction,
    outcome: AuditEvent['outcome'],
    summary: string,
    ref?: string,
  ) {
    db.appendAudit({
      id: createId('aud'),
      at: now().toISOString(),
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action,
      outcome,
      // Audit records never hold personal data typed by users.
      summary: redactPii(summary).slice(0, 300),
      ref,
      tenantId: tenant.id,
    });
  }

  const quote = (text: string) => `“${text.length > 80 ? `${text.slice(0, 77)}...` : text}”`;

  function lockoutKey(email: string) {
    return `${LOCKOUT_PREFIX}${tenant.id}.${email}`;
  }

  function data(session: Session) {
    return db.forUser(session.user);
  }

  function persist(session: Session) {
    db.save(session.user);
  }

  // -------------------------------------------------------------------------
  // API
  // -------------------------------------------------------------------------

  const api: TwinDeskApi & { resetDemoData(): void } = {
    auth: {
      async login(input): Promise<LoginResult> {
        const { email, password } = parseInput(loginInputSchema, input);
        await latency(400, 400);
        const key = lockoutKey(email);
        const lock = JSON.parse(store.get(key) ?? '{"count":0,"until":0}') as {
          count: number;
          until: number;
        };
        const t = now().getTime();
        if (lock.until > t) {
          const seconds = Math.ceil((lock.until - t) / 1000);
          throw new ApiError('locked', `Too many attempts. Try again in ${seconds} seconds.`, {
            status: 423,
            retryAfterSeconds: seconds,
          });
        }
        const base = DEMO_USERS.find((u) => u.email === email);
        if (!base || password !== DEMO_PASSWORD) {
          const count = lock.count + 1;
          const locked = count >= tenant.security.maxLoginAttempts;
          store.set(
            key,
            JSON.stringify({
              count: locked ? 0 : count,
              until: locked ? t + LOCKOUT_SECONDS * 1000 : 0,
            }),
          );
          audit(
            { id: 'unknown', name: 'Unknown', role: 'system' },
            'auth.failed',
            'failure',
            locked ? 'Sign-in locked after repeated failures' : 'Failed sign-in attempt',
          );
          // Same message for unknown email and wrong password, so accounts cannot be enumerated.
          throw new ApiError(
            'unauthenticated',
            'That email and password combination is not right.',
            { status: 401 },
          );
        }
        store.remove(key);
        const user = userFor(base);
        if (!tenant.security.mfaRequired) {
          audit(user, 'auth.login', 'success', 'Signed in with password');
          return { status: 'authenticated', session: createSession(user, 'password') };
        }
        const challengeId = createId('mfa');
        challenges.set(challengeId, { userId: user.id, expiresAt: t + MFA_TTL_MS, attempts: 0 });
        return {
          status: 'mfa-required',
          challengeId,
          maskedDestination: 'your authenticator app',
          method: 'totp',
        };
      },

      async verifyMfa(input) {
        const { challengeId, code } = parseInput(mfaInputSchema, input);
        await latency(300, 300);
        const challenge = challenges.get(challengeId);
        if (!challenge || challenge.expiresAt < now().getTime()) {
          challenges.delete(challengeId);
          throw new ApiError('unauthenticated', 'That code has expired. Please sign in again.', {
            status: 401,
          });
        }
        const base = DEMO_USERS.find((u) => u.id === challenge.userId);
        if (!base) throw new ApiError('unauthenticated', 'Please sign in again.', { status: 401 });
        if (code !== DEMO_MFA_CODE) {
          challenge.attempts += 1;
          if (challenge.attempts >= MAX_MFA_ATTEMPTS) {
            challenges.delete(challengeId);
            audit(
              userFor(base),
              'auth.failed',
              'failure',
              'Too many incorrect authenticator codes',
            );
            throw new ApiError(
              'unauthenticated',
              'Too many incorrect codes. Please sign in again.',
              { status: 401 },
            );
          }
          throw new ApiError('validation', 'That code is not right.', {
            status: 422,
            fieldErrors: {
              code: 'That code is not right. Check your authenticator app and try again.',
            },
          });
        }
        challenges.delete(challengeId);
        const user = userFor(base);
        audit(user, 'auth.login', 'success', 'Signed in with password and authenticator code');
        return createSession(user, 'password');
      },

      async startSso(provider) {
        await latency(900, 500);
        const base = provider === 'saml' ? DEMO_USERS[2] : DEMO_USERS[0];
        if (!base) throw new ApiError('server', 'Single sign-on is not available.');
        const user = userFor(base);
        audit(
          user,
          'auth.login',
          'success',
          `Signed in with ${provider === 'saml' ? 'SAML single sign-on' : `${provider[0]?.toUpperCase()}${provider.slice(1)} single sign-on`}`,
        );
        return { status: 'authenticated', session: createSession(user, 'sso') };
      },

      async getSession() {
        await latency(60, 60);
        return currentSession();
      },

      async touch() {
        const stored = readStored();
        if (stored && currentSession()) writeStored({ ...stored, lastActivity: now().getTime() });
      },

      async logout(reason = 'user') {
        const stored = readStored();
        store.remove(SESSION_KEY);
        if (stored) {
          audit(
            stored.session.user,
            reason === 'user' ? 'auth.logout' : 'auth.timeout',
            'success',
            reason === 'user' ? 'Signed out' : 'Signed out after inactivity',
          );
        }
        await latency(80, 80);
      },
    },

    twin: {
      async *ask(request, signal): AsyncGenerator<TwinStreamEvent> {
        const session = requireSession('twin.ask');
        const question = sanitizeText(request.question, { maxLength: 2000 });
        if (!question) throw new ApiError('validation', 'Type a question first.', { status: 422 });
        const userData = data(session);
        const ctx: ScenarioContext = {
          user: session.user,
          tenant,
          now: now(),
          args: '',
          question,
          createPriceAlert(instrument, level) {
            const alert: Alert = {
              id: createId('al'),
              kind: 'price',
              name: `${instrument} at ${level}`,
              condition: `${instrument} trades at ${level}`,
              instrument,
              level,
              channels: ['in-app', 'push'],
              status: 'active',
              createdAt: now().toISOString(),
            };
            userData.alerts.unshift(alert);
            audit(
              session.user,
              'alert.created',
              'success',
              `Created price alert ${alert.name} from /alert`,
              alert.id,
            );
            return alert;
          },
          upsertApproval(partial) {
            const existing = userData.approvals.find((a) => a.id === partial.id);
            const approval: Approval = {
              ...partial,
              createdAt: now().toISOString(),
              status: 'pending',
              checks: ADVICE_CHECKS.map(({ id, label }) => ({ id, label, passed: true })),
            };
            if (existing && existing.status === 'pending') Object.assign(existing, approval);
            else if (!existing) userData.approvals.unshift(approval);
            else {
              approval.id = `${partial.id}_${createId('r').slice(-4)}`;
              userData.approvals.unshift(approval);
            }
            return approval;
          },
          saveNote(text) {
            userData.notes.unshift({
              id: createId('note'),
              text: sanitizeText(text, { maxLength: 1000 }),
              at: now().toISOString(),
            });
          },
          pendingApprovals: () => userData.approvals.filter((a) => a.status === 'pending'),
          openActionItems: () => userData.actionItems.filter((i) => !i.done),
          events: () => ECONOMIC_EVENTS,
        };

        for await (const event of runTwin(ctx, { speed }, signal)) {
          if (event.type === 'done') {
            const { answer } = event;
            const action: AuditAction =
              answer.status === 'refused'
                ? 'twin.refused'
                : answer.status === 'withheld'
                  ? 'twin.withheld'
                  : 'twin.answer';
            const passed = answer.checks.filter((c) => c.passed).length;
            audit(
              { id: 'twin', name: tenant.productName, role: 'twin' },
              action,
              answer.status === 'answered' || answer.status === 'not-covered'
                ? 'success'
                : 'blocked',
              `${answer.status === 'refused' ? 'Declined' : 'Answered'} ${session.user.name.split(' ')[0]}: ${quote(question)} (${passed} of ${answer.checks.length} checks)`,
              answer.id,
            );
            persist(session);
          }
          yield event;
        }
      },

      async suggestions(deskType) {
        requireSession('twin.ask');
        await latency(80, 80);
        return [...SUGGESTIONS[deskType], ...SUGGESTIONS.common];
      },

      async feedback(answerId, rating) {
        const session = requireSession('twin.ask');
        await latency();
        audit(
          session.user,
          'twin.answer',
          'success',
          `Marked answer as ${rating === 'helpful' ? 'helpful' : 'not helpful'}`,
          answerId,
        );
      },
    },

    desk: {
      async overview() {
        const session = requireSession();
        await latency();
        const d = data(session);
        const t = now();
        return {
          routine: buildRoutine(d.deskType, session.user.timezone, t),
          ruleWatch: buildRuleWatch(d.deskType, session.user.timezone, t),
          events: ECONOMIC_EVENTS,
          actionItems: d.actionItems,
          news: seedNews(t.getTime()),
          offYourPlate: [
            'Copying events into your calendar',
            'Writing up the session from memory',
            'Checking your limits by hand',
          ],
          timeSavedThisWeek: { minutes: 214, runs: 23 },
        };
      },

      async setActionItemDone(id, done) {
        const session = requireSession();
        await latency(80, 120);
        const item = data(session).actionItems.find((i) => i.id === id) ?? notFound('item');
        item.done = done;
        persist(session);
      },

      async setDeskType(deskType) {
        const session = requireSession();
        await latency();
        data(session).deskType = deskType;
        persist(session);
        const stored = readStored();
        const updated: Session = { ...session, user: { ...session.user, deskType } };
        if (stored) writeStored({ ...stored, session: updated });
        audit(
          session.user,
          'settings.changed',
          'success',
          `Set up the desk for ${deskType.replace('-', ' ')}`,
        );
        return updated;
      },
    },

    automations: {
      async list(kind) {
        const session = requireSession();
        await latency();
        const items = data(session).automations;
        return kind ? items.filter((a) => a.kind === kind) : items;
      },

      async get(id) {
        const session = requireSession();
        await latency(80, 120);
        return data(session).automations.find((a) => a.id === id) ?? notFound('task or workflow');
      },

      async runs(id) {
        const session = requireSession();
        await latency(80, 120);
        return data(session).runs[id] ?? [];
      },

      async plan(request) {
        const parsed = parseInput(planRequestSchema, request);
        requireSession(parsed.kind === 'task' ? 'tasks.manage' : 'workflows.manage');
        await latency(900, 600);
        return planAutomation(
          parsed.kind,
          sanitizeText(parsed.instruction, { maxLength: 1000 }),
          now(),
        );
      },

      async save(draft) {
        const parsed = parseInput(automationSchema, draft);
        const session = requireSession(
          parsed.kind === 'task' ? 'tasks.manage' : 'workflows.manage',
        );
        await latency();
        const d = data(session);
        if (
          parsed.shortcut &&
          d.shortcuts.some((s) => s.command === parsed.shortcut && s.automationId !== parsed.id)
        ) {
          throw new ApiError('conflict', `${parsed.shortcut} is already in use.`, {
            status: 409,
            fieldErrors: { shortcut: `${parsed.shortcut} is already in use` },
          });
        }
        const saved: Automation = {
          ...parsed,
          status: parsed.status === 'draft' ? 'active' : parsed.status,
        };
        const index = d.automations.findIndex((a) => a.id === saved.id);
        if (index >= 0) d.automations[index] = saved;
        else d.automations.unshift(saved);
        if (saved.shortcut && !d.shortcuts.some((s) => s.command === saved.shortcut)) {
          d.shortcuts.push({
            id: createId('sc'),
            command: saved.shortcut,
            title: saved.name,
            description: saved.instruction.slice(0, 200),
            automationId: saved.id,
            usageCount: 0,
            builtIn: false,
          });
        }
        persist(session);
        audit(
          session.user,
          'automation.created',
          'success',
          `Saved ${saved.kind} “${saved.name}” (${saved.steps.length} steps)`,
          saved.id,
        );
        return saved;
      },

      async setStatus(id, status) {
        const session = requireSession();
        await latency();
        const a =
          data(session).automations.find((x) => x.id === id) ?? notFound('task or workflow');
        if (!can(session.user.role, a.kind === 'task' ? 'tasks.manage' : 'workflows.manage')) {
          throw new ApiError('forbidden', 'You do not have access to this.', { status: 403 });
        }
        a.status = status;
        persist(session);
        audit(
          session.user,
          status === 'paused' ? 'automation.paused' : 'automation.run',
          'success',
          `${status === 'paused' ? 'Paused' : 'Resumed'} “${a.name}”`,
          a.id,
        );
        return a;
      },

      async run(id) {
        const session = requireSession();
        const d = data(session);
        const a = d.automations.find((x) => x.id === id) ?? notFound('task or workflow');
        if (!can(session.user.role, a.kind === 'task' ? 'tasks.manage' : 'workflows.manage')) {
          throw new ApiError('forbidden', 'You do not have access to this.', { status: 403 });
        }
        await latency(1200, 600);
        const startedAt = now();
        const needsApproval = a.steps.some((s) => s.needsApproval);
        const run: AutomationRun = {
          id: createId('run'),
          automationId: a.id,
          startedAt: startedAt.toISOString(),
          finishedAt: new Date(startedAt.getTime() + 1500).toISOString(),
          status: needsApproval ? 'awaiting-approval' : 'succeeded',
          trigger: 'manual',
          steps: a.steps.map((s, i) => ({
            stepId: s.id,
            status: s.needsApproval ? 'waiting' : 'succeeded',
            message: s.needsApproval ? 'Waiting for your approval.' : `Completed · ${s.system}`,
            at: new Date(startedAt.getTime() + (i + 1) * 300).toISOString(),
          })),
        };
        (d.runs[a.id] ??= []).unshift(run);
        a.lastRun = run;
        if (needsApproval) {
          d.approvals.unshift({
            id: createId('apr'),
            kind: 'email',
            title: `${a.name}: draft ready`,
            summary: `Prepared by “${a.name}”. Nothing is sent until you approve.`,
            recipients: a.recipients.map((r) => ({
              name: r,
              address: r.includes('@') ? r : 'address on file',
            })),
            subject: a.name,
            body: `Prepared by your twin from: ${a.instruction}`,
            attachments: [],
            origin: a.name,
            createdAt: now().toISOString(),
            status: 'pending',
            checks: ADVICE_CHECKS.map(({ id: checkId, label }) => ({
              id: checkId,
              label,
              passed: true,
            })),
          });
        }
        persist(session);
        audit(
          { id: 'system', name: 'System', role: 'system' },
          'automation.run',
          'success',
          `Ran “${a.name}” on request: ${a.steps.length} steps`,
          a.id,
        );
        return run;
      },
    },

    shortcuts: {
      async list() {
        const session = requireSession();
        await latency(80, 120);
        return [...data(session).shortcuts].sort((a, b) => b.usageCount - a.usageCount);
      },
      async remove(id) {
        const session = requireSession('shortcuts.manage');
        await latency();
        const d = data(session);
        const s = d.shortcuts.find((x) => x.id === id) ?? notFound('shortcut');
        if (s.builtIn)
          throw new ApiError('forbidden', 'Built-in shortcuts cannot be removed.', { status: 403 });
        d.shortcuts = d.shortcuts.filter((x) => x.id !== id);
        persist(session);
      },
    },

    alerts: {
      async list() {
        const session = requireSession();
        await latency();
        return data(session).alerts;
      },
      async create(input) {
        const parsed = parseInput(createAlertInputSchema, input);
        const session = requireSession('alerts.manage');
        await latency();
        const base = {
          id: createId('al'),
          channels: parsed.channels,
          status: 'active' as const,
          createdAt: now().toISOString(),
        };
        let alert: Alert;
        switch (parsed.kind) {
          case 'price':
            alert = {
              ...base,
              kind: 'price',
              name: `${parsed.instrument} at ${parsed.level}`,
              condition: `${parsed.instrument} trades at ${parsed.level}`,
              instrument: parsed.instrument,
              level: parsed.level,
            };
            break;
          case 'loss-limit':
            alert = {
              ...base,
              kind: 'loss-limit',
              name: `${parsed.thresholdPct}% of daily loss limit used`,
              condition: `${parsed.thresholdPct}% of your 5% daily loss limit is used`,
              thresholdPct: parsed.thresholdPct,
            };
            break;
          case 'release':
            alert = {
              ...base,
              kind: 'release',
              name: `${parsed.impact === 'high' ? 'High' : 'Medium and high'}-impact release in ${parsed.minutesBefore} minutes`,
              condition: `A ${parsed.impact}-impact release is ${parsed.minutesBefore} minutes away`,
            };
            break;
          case 'session-rule':
            alert = {
              ...base,
              kind: 'session-rule',
              name: 'Trading outside your session rule',
              condition: 'A trade opens outside London 07:00 to 16:30',
            };
            break;
        }
        data(session).alerts.unshift(alert);
        persist(session);
        audit(session.user, 'alert.created', 'success', `Created alert “${alert.name}”`, alert.id);
        return alert;
      },
      async setStatus(id, status) {
        const session = requireSession('alerts.manage');
        await latency(80, 120);
        const alert = data(session).alerts.find((a) => a.id === id) ?? notFound('alert');
        alert.status = status;
        persist(session);
        return alert;
      },
      async remove(id) {
        const session = requireSession('alerts.manage');
        await latency();
        const d = data(session);
        const alert = d.alerts.find((a) => a.id === id) ?? notFound('alert');
        d.alerts = d.alerts.filter((a) => a.id !== id);
        persist(session);
        audit(session.user, 'alert.removed', 'success', `Removed alert “${alert.name}”`, id);
      },
      async notifications() {
        const session = requireSession();
        await latency(60, 80);
        return data(session).notifications;
      },
      async markRead(ids) {
        const session = requireSession();
        await latency(40, 60);
        for (const n of data(session).notifications) if (ids.includes(n.id)) n.read = true;
        persist(session);
      },
    },

    approvals: {
      async list() {
        const session = requireSession();
        await latency();
        return [...data(session).approvals].sort((a, b) =>
          a.status === 'pending' && b.status !== 'pending'
            ? -1
            : b.status === 'pending' && a.status !== 'pending'
              ? 1
              : b.createdAt.localeCompare(a.createdAt),
        );
      },
      async decide(decision) {
        const { id, decision: outcome, note } = parseInput(approvalDecisionSchema, decision);
        const session = requireSession('approvals.decide');
        await latency(400, 300);
        const d = data(session);
        const approval = d.approvals.find((a) => a.id === id) ?? notFound('approval');
        if (approval.status !== 'pending') {
          throw new ApiError('conflict', 'This has already been decided.', { status: 409 });
        }
        approval.status = outcome;
        approval.decidedBy = session.user.name;
        approval.decidedAt = now().toISOString();
        approval.decisionNote = note ? sanitizeText(note, { maxLength: 500 }) : undefined;
        if (approval.id === 'apr_recap_today' && outcome === 'approved') {
          const item = d.actionItems.find((i) => i.id === 'ai_2');
          if (item) item.done = true;
        }
        persist(session);
        audit(
          session.user,
          outcome === 'approved' ? 'approval.approved' : 'approval.rejected',
          'success',
          `${outcome === 'approved' ? 'Approved' : 'Rejected'} ${approval.kind.replace('-', ' ')} “${approval.title}” to ${approval.recipients.map((r) => r.name).join(', ')}`,
          approval.id,
        );
        return approval;
      },
    },

    sources: {
      async list() {
        const session = requireSession();
        await latency();
        return data(session).sources;
      },
      async connect(input) {
        const parsed = parseInput(connectSourceInputSchema, input);
        const session = requireSession('sources.manage');
        await latency(1100, 500);
        const source =
          data(session).sources.find((s) => s.id === parsed.sourceId) ?? notFound('source');
        if (source.authMethod === 'api-key' && !parsed.apiKey) {
          throw new ApiError('validation', 'Add the read-only API key.', {
            status: 422,
            fieldErrors: { apiKey: 'Add the read-only API key' },
          });
        }
        // The key would be written to the vault here. It is deliberately not kept anywhere in the
        // mock, and the response never contains it.
        const updated: ConnectedSource = {
          ...source,
          name: source.name,
          status: 'connected',
          scopes: source.scopes.length ? source.scopes : (DEFAULT_SCOPES[source.authMethod] ?? []),
          lastSyncAt: now().toISOString(),
          recordCount: Math.round(40 + rand() * 900),
          errorMessage: undefined,
        };
        Object.assign(source, updated);
        persist(session);
        audit(
          session.user,
          'source.connected',
          'success',
          `Connected ${source.name} as “${sanitizeText(parsed.label, { maxLength: 60, multiline: false })}”, ${source.access}, ${source.scopes.length} scopes`,
          source.id,
        );
        return source;
      },
      async revoke(id) {
        const session = requireSession('sources.manage');
        await latency();
        const source = data(session).sources.find((s) => s.id === id) ?? notFound('source');
        Object.assign(source, {
          status: 'not-connected',
          scopes: [],
          lastSyncAt: undefined,
          recordCount: undefined,
          errorMessage: undefined,
        });
        persist(session);
        audit(session.user, 'source.revoked', 'success', `Revoked access to ${source.name}`, id);
        return source;
      },
      async sync(id) {
        const session = requireSession('sources.manage');
        await latency(900, 600);
        const source = data(session).sources.find((s) => s.id === id) ?? notFound('source');
        if (source.status === 'error')
          throw new ApiError('conflict', 'Reconnect this source before fetching again.', {
            status: 409,
          });
        if (source.status === 'not-connected')
          throw new ApiError('conflict', 'Connect this source first.', { status: 409 });
        source.lastSyncAt = now().toISOString();
        source.recordCount = (source.recordCount ?? 0) + Math.round(rand() * 20);
        persist(session);
        return source;
      },
    },

    audit: {
      async list(query) {
        const session = requireSession('audit.read');
        const q = parseInput(auditQuerySchema, query);
        await latency();
        const items = filterAudit(db.audit(tenant.id), q, session);
        return { items: items.slice(0, 200), total: items.length };
      },
      async exportCsv(query) {
        const session = requireSession('audit.export');
        const q = parseInput(auditQuerySchema, query);
        await latency(600, 400);
        const items = filterAudit(db.audit(tenant.id), q, session);
        const header = ['Time (UTC)', 'Actor', 'Role', 'Action', 'Outcome', 'Summary', 'Reference'];
        const rows = items.map((e) => [
          e.at,
          e.actor.name,
          e.actor.role,
          e.action,
          e.outcome,
          e.summary,
          e.ref ?? '',
        ]);
        const content = [header, ...rows].map((r) => r.map(toCsvCell).join(',')).join('\r\n');
        audit(session.user, 'data.exported', 'success', `Exported ${items.length} audit records`);
        return { filename: `audit-${tenant.id}-${now().toISOString().slice(0, 10)}.csv`, content };
      },
    },

    resetDemoData() {
      db.reset(tenant.id);
    },
  };

  return api;
}

const ACTION_GROUPS: Record<Exclude<AuditQuery['action'], 'all'>, string> = {
  auth: 'auth.',
  twin: 'twin.',
  approval: 'approval.',
  automation: 'automation.',
  source: 'source.',
  alert: 'alert.',
  settings: 'settings.',
  data: 'data.',
};

/**
 * Traders and support staff see their own activity and what the twin did for them; compliance
 * and administrators see the whole tenant. The real API applies the same rule in SQL.
 */
function filterAudit(events: AuditEvent[], q: AuditQuery, session: Session): AuditEvent[] {
  const wide = session.user.role === 'compliance' || session.user.role === 'admin';
  const firstName = session.user.name.split(' ')[0] ?? '';
  const search = q.search?.toLowerCase();
  return events.filter((e) => {
    if (!wide) {
      const mine =
        e.actor.id === session.user.id ||
        ((e.actor.role === 'twin' || e.actor.role === 'system') &&
          (e.summary.includes(firstName) || e.action === 'automation.run'));
      if (!mine) return false;
    }
    if (q.action !== 'all' && !e.action.startsWith(ACTION_GROUPS[q.action])) return false;
    if (q.outcome !== 'all' && e.outcome !== q.outcome) return false;
    if (
      search &&
      !`${e.summary} ${e.actor.name} ${e.ref ?? ''} ${e.action}`.toLowerCase().includes(search)
    )
      return false;
    return true;
  });
}
