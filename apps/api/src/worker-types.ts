/**
 * The few Cloudflare Workers runtime types this server uses. Declared here rather than pulling
 * in @cloudflare/workers-types, whose globals clash with the DOM types the shared core is
 * checked against. The web standards (fetch, crypto, URL) come from the DOM library.
 */

export interface D1Result {
  meta: { changes: number };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export interface ScheduledController {
  /** When this run was due, in milliseconds since the epoch. */
  scheduledTime: number;
  cron: string;
}
