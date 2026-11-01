/**
 * Returns a normalised URL only if it is safe to put in an href: https (or a same-origin path),
 * no credentials, and optionally on an allow-listed host. Everything else, including
 * `javascript:` and `data:` URLs, returns null.
 */
export function safeUrl(
  value: string | undefined | null,
  {
    allowedHosts,
    allowRelative = true,
  }: { allowedHosts?: readonly string[]; allowRelative?: boolean } = {},
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (allowRelative && /^\/(?!\/)/.test(trimmed)) return trimmed;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (
    allowedHosts &&
    !allowedHosts.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`))
  ) {
    return null;
  }
  return url.toString();
}

/** Exact origin comparison for postMessage handlers. Never use `includes` or `startsWith`. */
export function isAllowedOrigin(origin: string, allowed: readonly string[]): boolean {
  return allowed.includes(origin);
}
