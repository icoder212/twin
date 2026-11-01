import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createHttpClient } from '../api/http-client';
import { readEventStream } from '../api/event-stream';
import { ApiError } from '../api/errors';

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' }, ...init });

describe('http client', () => {
  it('refuses plain http outside localhost', () => {
    expect(() => createHttpClient({ baseUrl: 'http://api.example.com' })).toThrow(/https/);
  });

  it('sends cookies, the CSRF header and validates responses', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ ok: true }));
    const http = createHttpClient({
      baseUrl: 'https://api.example.com',
      fetchImpl,
      getCsrfToken: () => 'tok',
    });
    await http.request('/v1/x', {
      method: 'POST',
      body: { a: 1 },
      schema: z.object({ ok: z.boolean() }),
    });
    const [, init] = fetchImpl.mock.calls[0] ?? [];
    expect(init?.credentials).toBe('include');
    expect(new Headers(init?.headers).get('X-CSRF-Token')).toBe('tok');
  });

  it('turns an unexpected response shape into a safe error', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ unexpected: 1 }));
    const http = createHttpClient({ baseUrl: 'https://api.example.com', fetchImpl });
    await expect(
      http.request('/v1/x', { schema: z.object({ ok: z.boolean() }) }),
    ).rejects.toMatchObject({ code: 'server' });
  });

  it('maps 401 to unauthenticated and notifies the app', async () => {
    const onUnauthenticated = vi.fn();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ message: 'Signed out' }, { status: 401 }));
    const http = createHttpClient({
      baseUrl: 'https://api.example.com',
      fetchImpl,
      onUnauthenticated,
    });
    const error = await http.request('/v1/x', { schema: z.unknown() }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('unauthenticated');
    expect(onUnauthenticated).toHaveBeenCalledOnce();
  });

  it('rejects protocol-relative paths', async () => {
    const http = createHttpClient({
      baseUrl: 'https://api.example.com',
      fetchImpl: vi.fn<typeof fetch>(),
    });
    await expect(http.request('//evil.com/x', { schema: z.unknown() })).rejects.toThrow();
  });
});

describe('event stream', () => {
  it('parses and validates server-sent events', async () => {
    const body = new Response('data: {"n":1}\n\ndata: {"n":2}\n\n').body;
    if (!body) throw new Error('no body');
    const out: number[] = [];
    for await (const e of readEventStream(body, z.object({ n: z.number() }))) out.push(e.n);
    expect(out).toEqual([1, 2]);
  });

  it('fails on events that do not match the schema', async () => {
    const body = new Response('data: {"n":"x"}\n\n').body;
    if (!body) throw new Error('no body');
    const run = async () => {
      for await (const e of readEventStream(body, z.object({ n: z.number() }))) void e;
    };
    await expect(run()).rejects.toThrow();
  });
});
