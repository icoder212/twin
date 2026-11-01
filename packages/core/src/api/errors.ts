export type ApiErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not-found'
  | 'validation'
  | 'rate-limited'
  | 'locked'
  | 'conflict'
  | 'timeout'
  | 'network'
  | 'server';

/**
 * Normalised error for every adapter. `message` is always safe to show to users: adapters map
 * server responses onto it and never surface stack traces, SQL or provider error bodies.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  /** Correlates with server logs; safe to show so users can quote it to support. */
  readonly requestId: string | undefined;
  readonly fieldErrors: Record<string, string> | undefined;
  readonly retryAfterSeconds: number | undefined;

  constructor(
    code: ApiErrorCode,
    message: string,
    opts: {
      status?: number;
      requestId?: string;
      fieldErrors?: Record<string, string>;
      retryAfterSeconds?: number;
    } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = opts.status ?? 0;
    this.requestId = opts.requestId;
    this.fieldErrors = opts.fieldErrors;
    this.retryAfterSeconds = opts.retryAfterSeconds;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

const FRIENDLY: Record<ApiErrorCode, string> = {
  unauthenticated: 'Your session has ended. Please sign in again.',
  forbidden: 'You do not have access to this.',
  'not-found': 'We could not find that.',
  validation: 'Some details need fixing.',
  'rate-limited': 'Too many requests. Please wait a moment and try again.',
  locked: 'This account is temporarily locked.',
  conflict: 'This changed while you were looking at it. Refresh and try again.',
  timeout: 'This is taking longer than usual. Please try again.',
  network: 'We cannot reach the server. Check your connection.',
  server: 'Something went wrong on our side. Please try again.',
};

/** The message to show a user for any thrown value, without leaking internals. */
export function userMessage(error: unknown): string {
  if (isApiError(error)) return error.message || FRIENDLY[error.code];
  return FRIENDLY.server;
}
