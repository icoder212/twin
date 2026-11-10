import { z } from 'zod';
import { GOOGLE_CALENDAR_SCOPE } from '@twindesk/core';
import type { Config } from './config';
import { decodeBase64UrlText } from './crypto';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

/** Who is signing in (to check it is the owner) and read-only calendar access. */
const SCOPES = ['openid', 'email', GOOGLE_CALENDAR_SCOPE];

/** Authorisation-code flow with PKCE, asking for lasting (offline) read-only access. */
export function googleAuthUrl(
  config: Config,
  redirectUri: string,
  state: string,
  codeChallenge: string,
): string {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: config.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'false',
    login_hint: config.OWNER_GOOGLE_ACCOUNT,
  }).toString();
  return url.toString();
}

const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().optional(),
  scope: z.string().default(''),
  id_token: z.string().optional(),
});
export type GoogleTokens = z.infer<typeof tokenSchema>;

/** `revoked`: the lasting access was withdrawn or expired, so the owner must connect again. */
export class GoogleAuthError extends Error {
  readonly reason: 'revoked' | 'failed';

  constructor(reason: 'revoked' | 'failed', message: string) {
    super(message);
    this.name = 'GoogleAuthError';
    this.reason = reason;
  }
}

async function tokenRequest(
  body: Record<string, string>,
  fetchFn: typeof fetch,
): Promise<GoogleTokens> {
  const response = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code = (data as { error?: unknown } | null)?.error;
    throw new GoogleAuthError(
      code === 'invalid_grant' ? 'revoked' : 'failed',
      `Google token request failed (${response.status}${typeof code === 'string' ? `, ${code}` : ''})`,
    );
  }
  const parsed = tokenSchema.safeParse(data);
  if (!parsed.success) throw new GoogleAuthError('failed', 'Google sent an unreadable token reply');
  return parsed.data;
}

export function exchangeCode(
  config: Config,
  code: string,
  codeVerifier: string,
  redirectUri: string,
  fetchFn: typeof fetch,
): Promise<GoogleTokens> {
  return tokenRequest(
    {
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      client_id: config.GOOGLE_CLIENT_ID,
      client_secret: config.GOOGLE_CLIENT_SECRET,
    },
    fetchFn,
  );
}

export function refreshAccessToken(
  config: Config,
  refreshToken: string,
  fetchFn: typeof fetch,
): Promise<GoogleTokens> {
  return tokenRequest(
    {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.GOOGLE_CLIENT_ID,
      client_secret: config.GOOGLE_CLIENT_SECRET,
    },
    fetchFn,
  );
}

/**
 * The verified address in an ID token received straight from Google's token endpoint over TLS,
 * where OpenID Connect allows skipping the signature check. Never use it for tokens from
 * anywhere else.
 */
export function idTokenEmail(idToken: string | undefined): string | null {
  const payload = idToken?.split('.')[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(decodeBase64UrlText(payload)) as {
      email?: unknown;
      email_verified?: unknown;
    };
    return typeof claims.email === 'string' && claims.email_verified === true
      ? claims.email.toLowerCase()
      : null;
  } catch {
    return null;
  }
}
