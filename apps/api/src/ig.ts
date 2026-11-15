import { z } from 'zod';
import type { Config } from './config';
import { seal, unseal } from './crypto';
import type { Store } from './store';

/**
 * IG's Web API, for prices only. The login is kept sealed with TOKEN_KEY and reused until IG ends
 * it, so the server logs in a few times a day rather than every minute. Nothing here can place,
 * change or close a trade: only market search and market details are ever requested.
 */

export class IgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IgError';
  }
}

export interface IgDeps {
  config: Config;
  store: Store;
  fetch: typeof fetch;
  now: number;
}

const SESSION_KEY = 'ig-session';
/** IG ends a session after six hours without use; log in again a little before that. */
const SESSION_MS = 5 * 3_600_000;

interface IgSession {
  cst: string;
  token: string;
  at: number;
}

export function igReady(config: Config): boolean {
  return Boolean(config.IG_API_KEY && config.IG_USERNAME && config.IG_PASSWORD);
}

function baseHeaders(config: Config, version: string): Record<string, string> {
  return {
    'X-IG-API-KEY': config.IG_API_KEY ?? '',
    Accept: 'application/json; charset=UTF-8',
    'Content-Type': 'application/json; charset=UTF-8',
    Version: version,
  };
}

async function errorCode(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { errorCode?: unknown } | null;
  return typeof body?.errorCode === 'string'
    ? body.errorCode.slice(0, 80)
    : `HTTP ${response.status}`;
}

async function login(deps: IgDeps): Promise<IgSession> {
  const { config, store, now } = deps;
  const response = await deps.fetch(`${config.IG_API_URL}/session`, {
    method: 'POST',
    headers: baseHeaders(config, '2'),
    body: JSON.stringify({ identifier: config.IG_USERNAME, password: config.IG_PASSWORD }),
  });
  if (!response.ok) throw new IgError(`IG refused the login (${await errorCode(response)})`);
  const cst = response.headers.get('CST');
  const token = response.headers.get('X-SECURITY-TOKEN');
  if (!cst || !token) throw new IgError('IG sent no session');
  const session: IgSession = { cst, token, at: now };
  await store.putSetting(SESSION_KEY, await seal(JSON.stringify(session), config.TOKEN_KEY), now);
  return session;
}

async function currentSession(deps: IgDeps, renew: boolean): Promise<IgSession> {
  if (!renew) {
    const sealed = await deps.store.getSetting(SESSION_KEY);
    if (sealed) {
      try {
        const session = JSON.parse(await unseal(sealed, deps.config.TOKEN_KEY)) as IgSession;
        if (deps.now - session.at < SESSION_MS) return session;
      } catch {
        // Unreadable, for example after TOKEN_KEY changed: log in again.
      }
    }
  }
  return login(deps);
}

/** A GET with the stored session, logging in again once if IG has ended it. */
async function igGet<T>(
  deps: IgDeps,
  path: string,
  version: string,
  schema: z.ZodType<T>,
): Promise<T> {
  if (!igReady(deps.config)) throw new IgError('IG prices are not set up on the server');
  const call = (session: IgSession) =>
    deps.fetch(`${deps.config.IG_API_URL}${path}`, {
      headers: {
        ...baseHeaders(deps.config, version),
        CST: session.cst,
        'X-SECURITY-TOKEN': session.token,
      },
    });
  let response = await call(await currentSession(deps, false));
  if (response.status === 401) response = await call(await currentSession(deps, true));
  if (!response.ok) throw new IgError(`IG could not send prices (${await errorCode(response)})`);
  const parsed = schema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new IgError('IG sent prices in an unexpected shape');
  return parsed.data;
}

const price = z.number().nullable().optional();

const searchSchema = z.object({
  markets: z.array(
    z.object({
      epic: z.string(),
      instrumentName: z.string(),
      instrumentType: z.string(),
      expiry: z.string(),
      marketStatus: z.string(),
      bid: price,
      offer: price,
      percentageChange: price,
    }),
  ),
});

const detailsSchema = z.object({
  marketDetails: z.array(
    z.object({
      instrument: z.object({ epic: z.string(), name: z.string() }),
      snapshot: z.object({
        marketStatus: z.string(),
        bid: price,
        offer: price,
        netChange: price,
        percentageChange: price,
        decimalPlacesFactor: price,
      }),
    }),
  ),
});

export interface IgSearchResult {
  epic: string;
  name: string;
  type: string;
  expiry: string;
  status: string;
  price: number | null;
  changePct: number | null;
}

/** Options, binaries and sprints have no daily change worth alerting on. */
const UNWATCHABLE = /^(?:OPT_|BINARY|SPRINT)/;

export async function searchMarkets(deps: IgDeps, term: string): Promise<IgSearchResult[]> {
  const data = await igGet(
    deps,
    `/markets?searchTerm=${encodeURIComponent(term)}`,
    '1',
    searchSchema,
  );
  return data.markets
    .filter((m) => !UNWATCHABLE.test(m.instrumentType))
    .slice(0, 20)
    .map((m) => ({
      epic: m.epic,
      name: m.instrumentName,
      type: m.instrumentType,
      expiry: m.expiry,
      status: m.marketStatus,
      price: mid(m.bid, m.offer),
      changePct: m.percentageChange ?? null,
    }));
}

export interface IgSnapshot {
  name: string;
  status: string;
  bid: number | null;
  offer: number | null;
  netChange: number | null;
  decimals: number;
}

/** The current snapshot of up to 50 markets, in one request, by identifier. */
export async function marketSnapshots(
  deps: IgDeps,
  epics: string[],
): Promise<Map<string, IgSnapshot>> {
  const out = new Map<string, IgSnapshot>();
  if (epics.length === 0) return out;
  const query = epics.slice(0, 50).map(encodeURIComponent).join(',');
  const data = await igGet(deps, `/markets?epics=${query}`, '2', detailsSchema);
  for (const { instrument, snapshot } of data.marketDetails) {
    out.set(instrument.epic, {
      name: instrument.name,
      status: snapshot.marketStatus,
      bid: snapshot.bid ?? null,
      offer: snapshot.offer ?? null,
      netChange: snapshot.netChange ?? null,
      decimals: Math.min(Math.max(Math.round(snapshot.decimalPlacesFactor ?? 2), 0), 8),
    });
  }
  return out;
}

export function mid(bid: number | null | undefined, offer: number | null | undefined) {
  if (typeof bid !== 'number') return null;
  return typeof offer === 'number' ? (bid + offer) / 2 : bid;
}
