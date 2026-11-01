import type { z } from 'zod';
import { ApiError, type ApiErrorCode } from './errors';

export interface HttpClientOptions {
  /** e.g. https://api.desktwin.example.com. Must be https outside local development. */
  baseUrl: string;
  /** Default per-request timeout. */
  timeoutMs?: number;
  /** Reads the CSRF token the server set in a readable cookie (double-submit pattern). */
  getCsrfToken?: () => string | null;
  /** Tenant routing header for multi-tenant deployments. */
  tenantId?: string;
  /** Called on 401 so the app can clear state and return to sign-in. */
  onUnauthenticated?: () => void;
  fetchImpl?: typeof fetch;
}

export interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Every response is validated: an unexpected shape is an error, not a crash in a component. */
  schema: z.ZodType<T>;
  signal?: AbortSignal;
  timeoutMs?: number;
}

const STATUS_CODES: Record<number, ApiErrorCode> = {
  400: 'validation',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not-found',
  409: 'conflict',
  422: 'validation',
  423: 'locked',
  429: 'rate-limited',
};

/**
 * Thin fetch wrapper for the future backend.
 *
 * - Cookies carry the session (`credentials: 'include'`); tokens are never put in JS storage.
 * - Mutating requests send a CSRF header.
 * - Requests time out and can be cancelled.
 * - Responses are schema-validated before they reach the UI.
 */
export function createHttpClient(options: HttpClientOptions) {
  const { baseUrl, timeoutMs = 15_000, getCsrfToken, tenantId, onUnauthenticated } = options;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const base = new URL(baseUrl);
  if (
    base.protocol !== 'https:' &&
    base.hostname !== 'localhost' &&
    base.hostname !== '127.0.0.1'
  ) {
    throw new Error('The API base URL must use https');
  }

  function buildHeaders(method: string, hasBody: boolean): Headers {
    const headers = new Headers({ Accept: 'application/json', 'X-Requested-With': 'twindesk' });
    if (hasBody) headers.set('Content-Type', 'application/json');
    if (tenantId) headers.set('X-Tenant-Id', tenantId);
    if (method !== 'GET') {
      const csrf = getCsrfToken?.();
      if (csrf) headers.set('X-CSRF-Token', csrf);
    }
    return headers;
  }

  async function raw(
    path: string,
    init: {
      method: string;
      body?: unknown;
      signal?: AbortSignal;
      timeoutMs?: number;
      accept?: string;
    },
  ) {
    if (!path.startsWith('/') || path.startsWith('//'))
      throw new Error('API paths must be absolute paths');
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new DOMException('Timeout', 'TimeoutError')),
      init.timeoutMs ?? timeoutMs,
    );
    const onAbort = () => controller.abort(init.signal?.reason);
    init.signal?.addEventListener('abort', onAbort, { once: true });

    try {
      const headers = buildHeaders(init.method, init.body !== undefined);
      if (init.accept) headers.set('Accept', init.accept);
      const response = await fetchImpl(new URL(path, base), {
        method: init.method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        credentials: 'include',
        mode: 'cors',
        redirect: 'error',
        referrerPolicy: 'strict-origin-when-cross-origin',
        signal: controller.signal,
      });
      if (!response.ok) throw await toApiError(response);
      return response;
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === 'unauthenticated') onUnauthenticated?.();
        throw error;
      }
      if (controller.signal.aborted && !init.signal?.aborted) {
        throw new ApiError('timeout', 'This is taking longer than usual. Please try again.');
      }
      if (init.signal?.aborted) throw error;
      throw new ApiError('network', 'We cannot reach the server. Check your connection.');
    } finally {
      clearTimeout(timer);
      init.signal?.removeEventListener('abort', onAbort);
    }
  }

  async function request<T>(path: string, opts: RequestOptions<T>): Promise<T> {
    const response = await raw(path, {
      method: opts.method ?? 'GET',
      body: opts.body,
      signal: opts.signal,
      timeoutMs: opts.timeoutMs,
    });
    if (response.status === 204) return opts.schema.parse(undefined);
    const parsed = opts.schema.safeParse(await response.json());
    if (!parsed.success) {
      throw new ApiError('server', 'We received an unexpected response.', {
        status: response.status,
        requestId: response.headers.get('X-Request-Id') ?? undefined,
      });
    }
    return parsed.data;
  }

  /** Opens a streaming endpoint (server-sent events) and returns the raw response. */
  function stream(path: string, body: unknown, signal?: AbortSignal) {
    return raw(path, {
      method: 'POST',
      body,
      signal,
      timeoutMs: 120_000,
      accept: 'text/event-stream',
    });
  }

  return { request, stream };
}

export type HttpClient = ReturnType<typeof createHttpClient>;

async function toApiError(response: Response): Promise<ApiError> {
  const code = STATUS_CODES[response.status] ?? 'server';
  const requestId = response.headers.get('X-Request-Id') ?? undefined;
  const retryAfter = Number(response.headers.get('Retry-After')) || undefined;
  let message: string | undefined;
  let fieldErrors: Record<string, string> | undefined;
  try {
    const body = (await response.json()) as { message?: unknown; fieldErrors?: unknown };
    // Only accept short plain strings from the server as user-facing text.
    if (typeof body.message === 'string' && body.message.length <= 200) message = body.message;
    if (body.fieldErrors && typeof body.fieldErrors === 'object') {
      fieldErrors = Object.fromEntries(
        Object.entries(body.fieldErrors as Record<string, unknown>).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      );
    }
  } catch {
    // Non-JSON error body: fall back to the generic message.
  }
  return new ApiError(code, message ?? '', {
    status: response.status,
    requestId,
    fieldErrors,
    retryAfterSeconds: retryAfter,
  });
}
