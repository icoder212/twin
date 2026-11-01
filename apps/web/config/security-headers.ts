/**
 * One definition of the browser security policy, used by the Vite build (CSP meta tag), the
 * dev and preview servers, and mirrored in deploy/nginx.conf for production.
 */

export interface CspOptions {
  /** Extra origins the app may call, e.g. the API and the event stream host. */
  connectSrc?: string[];
  /** Origins allowed to frame the app (white-label hosts). Only enforceable as a header. */
  frameAncestors?: string[];
  /** Trusted Types enforcement. Off in development because Vite's HMR client needs it off. */
  trustedTypes?: boolean;
}

export function contentSecurityPolicy({
  connectSrc = [],
  frameAncestors,
  trustedTypes = true,
}: CspOptions = {}): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    'style-src': ["'self'"],
    'img-src': ["'self'", 'data:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'", ...connectSrc],
    'frame-src': ["'self'"],
    'worker-src': ["'self'"],
    'manifest-src': ["'self'"],
    'media-src': ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'self'"],
  };
  if (frameAncestors)
    directives['frame-ancestors'] = frameAncestors.length ? frameAncestors : ["'none'"];
  if (trustedTypes) {
    directives['require-trusted-types-for'] = ["'script'"];
    directives['trusted-types'] = ["'none'"];
  }
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}

/** Headers that should accompany every HTML and asset response. */
export function securityHeaders(
  options: CspOptions & { csp?: boolean } = {},
): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy':
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
  };
  if (options.csp !== false) headers['Content-Security-Policy'] = contentSecurityPolicy(options);
  return headers;
}
