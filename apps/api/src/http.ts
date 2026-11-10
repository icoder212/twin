/** Every response is plain text or JSON, uncached, and never framed or rendered as a page. */
const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy':
    "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

export function text(body: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8', ...headers },
  });
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
  });
}

export function redirect(location: string, headers: Record<string, string> = {}): Response {
  return new Response(null, {
    status: 302,
    headers: { ...SECURITY_HEADERS, Location: location, ...headers },
  });
}

export function cookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

/** A JSON error the app's HTTP client shows as is: `{ message }`, at most 200 characters. */
export function apiError(status: number, message: string): Response {
  return json({ message: message.slice(0, 200) }, status);
}

/** The same response with cookies added; each needs its own Set-Cookie header. */
export function withCookies(response: Response, cookies: string[]): Response {
  const headers = new Headers(response.headers);
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(response.body, { status: response.status, headers });
}
