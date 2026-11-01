import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../api/errors';
import { createMemoryStore, type KeyValueStore } from '../storage/kv';
import { getTenantPreset } from '../tenants/presets';
import { createMockApi } from '../mock/mock-api';
import { DEMO_MFA_CODE, DEMO_PASSWORD } from '../mock/users';
import type { TwinStreamEvent } from '../domain/twin';

const tenant = getTenantPreset('alchmai');

async function signIn(api: ReturnType<typeof createMockApi>, email: string) {
  const result = await api.auth.login({ email, password: DEMO_PASSWORD });
  if (result.status !== 'mfa-required') throw new Error('expected MFA');
  return api.auth.verifyMfa({ challengeId: result.challengeId, code: DEMO_MFA_CODE });
}

async function collect(iterable: AsyncIterable<TwinStreamEvent>) {
  const events: TwinStreamEvent[] = [];
  for await (const e of iterable) events.push(e);
  return events;
}

describe('mock API', () => {
  let store: KeyValueStore;
  let api: ReturnType<typeof createMockApi>;

  beforeEach(() => {
    store = createMemoryStore();
    api = createMockApi({ tenant, store, speed: 0 });
  });

  it('requires MFA and creates a session', async () => {
    const session = await signIn(api, 'alex.morgan@demo.alchmai.com');
    expect(session.user.name).toBe('Alex Morgan');
    expect(session.mfaVerified).toBe(true);
    expect(await api.auth.getSession()).not.toBeNull();
  });

  it('uses one message for unknown users and wrong passwords', async () => {
    const a = await api.auth
      .login({ email: 'nobody@example.com', password: 'whatever1' })
      .catch((e: ApiError) => e.message);
    const b = await api.auth
      .login({ email: 'alex.morgan@demo.alchmai.com', password: 'wrongpass1' })
      .catch((e: ApiError) => e.message);
    expect(a).toBe(b);
  });

  it('locks sign-in after repeated failures', async () => {
    for (let i = 0; i < tenant.security.maxLoginAttempts; i += 1) {
      await api.auth
        .login({ email: 'alex.morgan@demo.alchmai.com', password: 'wrongpass1' })
        .catch(() => undefined);
    }
    const error = await api.auth
      .login({ email: 'alex.morgan@demo.alchmai.com', password: DEMO_PASSWORD })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('locked');
  });

  it('rejects calls without a session', async () => {
    await expect(api.alerts.list()).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('enforces permissions on the server side of the contract', async () => {
    await signIn(api, 'priya.shah@demo.alchmai.com');
    await expect(api.sources.revoke('src_mt5')).rejects.toMatchObject({ code: 'forbidden' });
    const csv = await api.audit.exportCsv({ action: 'all', outcome: 'all' });
    expect(csv.content.split('\r\n')[0]).toContain('Time (UTC)');
  });

  it('keeps each user’s data separate', async () => {
    await signIn(api, 'alex.morgan@demo.alchmai.com');
    await api.alerts.create({
      kind: 'price',
      instrument: 'xauusd',
      level: 2400,
      channels: ['in-app'],
    });
    expect((await api.alerts.list()).some((a) => a.instrument === 'XAUUSD')).toBe(true);
    await api.auth.logout();
    await signIn(api, 'sam.okafor@demo.alchmai.com');
    expect((await api.alerts.list()).some((a) => a.instrument === 'XAUUSD')).toBe(false);
  });

  it('validates input with field-level errors', async () => {
    await signIn(api, 'alex.morgan@demo.alchmai.com');
    const error = (await api.alerts
      .create({ kind: 'price', instrument: '<script>', level: -1, channels: [] })
      .catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe('validation');
    expect(Object.keys(error.fieldErrors ?? {})).toEqual(
      expect.arrayContaining(['instrument', 'level', 'channels']),
    );
  });

  it('streams routed, retrieved, checked, delta and done events', async () => {
    await signIn(api, 'alex.morgan@demo.alchmai.com');
    const events = await collect(
      api.twin.ask({ conversationId: 'c1', question: 'How close am I to my daily limit?' }),
    );
    const types = [...new Set(events.map((e) => e.type))];
    expect(types).toEqual(['routed', 'retrieved', 'checked', 'delta', 'done']);
    const done = events.at(-1);
    expect(done?.type === 'done' && done.answer.checks.every((c) => c.passed)).toBe(true);
  });

  it('refuses advice and reports the blocked draft without its text', async () => {
    await signIn(api, 'alex.morgan@demo.alchmai.com');
    const events = await collect(
      api.twin.ask({ conversationId: 'c1', question: 'Should I buy EURUSD now?' }),
    );
    const done = events.find((e) => e.type === 'done');
    expect(done?.type === 'done' && done.answer.status).toBe('refused');
    expect(done?.type === 'done' && done.answer.drafts[0]?.passed).toBe(false);
    expect(events.filter((e) => e.type === 'checked')).toHaveLength(2);
  });

  it('never writes personal data typed by users into the audit log', async () => {
    await signIn(api, 'alex.morgan@demo.alchmai.com');
    await collect(
      api.twin.ask({
        conversationId: 'c1',
        question: 'my card is 4242 4242 4242 4242, can my MT5 strategy be automated?',
      }),
    );
    const { items } = await api.audit.list({ action: 'twin', outcome: 'all' });
    expect(items[0]?.summary).not.toContain('4242 4242');
    expect(items[0]?.summary).toContain('[card ending 4242]');
  });

  it('runs a shortcut that creates an approval which can be decided once', async () => {
    await signIn(api, 'alex.morgan@demo.alchmai.com');
    await collect(api.twin.ask({ conversationId: 'c1', question: '/recap' }));
    const approval = (await api.approvals.list()).find((a) => a.id === 'apr_recap_today');
    expect(approval?.status).toBe('pending');
    await api.approvals.decide({ id: 'apr_recap_today', decision: 'approved' });
    await expect(
      api.approvals.decide({ id: 'apr_recap_today', decision: 'approved' }),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('ends the session after the idle timeout', async () => {
    let now = new Date('2026-10-30T09:00:00Z');
    const clockApi = createMockApi({
      tenant,
      store: createMemoryStore(),
      speed: 0,
      now: () => now,
    });
    await signIn(clockApi, 'alex.morgan@demo.alchmai.com');
    now = new Date(now.getTime() + (tenant.security.idleTimeoutMinutes + 1) * 60_000);
    expect(await clockApi.auth.getSession()).toBeNull();
  });
});
