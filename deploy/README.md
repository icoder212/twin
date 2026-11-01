# Deploying the web app

The web app is a static bundle. In production it is served by unprivileged nginx with strict
security headers; the API and AI services run separately.

## Build and run

From the repository root:

```sh
docker build -f deploy/Dockerfile -t twindesk-web .
docker run --rm -p 8080:8080 twindesk-web
# open http://localhost:8080
```

Build arguments (public values only; they are compiled into the JavaScript):

| Argument                     | Default   | Purpose                                                                |
| ---------------------------- | --------- | ---------------------------------------------------------------------- |
| `VITE_API_MODE`              | `mock`    | `mock` runs the in-browser demo backend; `http` calls the real API     |
| `VITE_API_BASE_URL`          | empty     | API origin, required for `http`, must be https                         |
| `VITE_DEMO_MODE`             | `true`    | Demo credentials on sign-in and the white-label switcher               |
| `VITE_DEFAULT_TENANT`        | `alchmai` | Tenant used when the hostname does not map to one                      |
| `VITE_EMBED_ALLOWED_ORIGINS` | empty     | Comma-separated https origins for the preview server's frame-ancestors |

Runtime environment (read by nginx at start-up):

| Variable                   | Default  | Purpose                                                                 |
| -------------------------- | -------- | ----------------------------------------------------------------------- |
| `TWINDESK_API_ORIGIN`      | empty    | Added to the CSP `connect-src`, e.g. `https://api.desktwin.example.com` |
| `TWINDESK_FRAME_ANCESTORS` | `'self'` | Default CSP `frame-ancestors` for hosts not listed in the map           |

## Where the headers live

- `apps/web/config/security-headers.ts` is the source of truth. Vite adds the CSP as a meta tag
  to every build and sends the same headers from `vite preview`.
- `deploy/nginx/security-headers.inc.template` mirrors it for production, adding
  `frame-ancestors` and HSTS, which cannot be set from a meta tag. Change both files together.
- Both a header CSP and the meta CSP are enforced; a request must satisfy both, so keep their
  `connect-src` values in step (`VITE_API_BASE_URL` and `TWINDESK_API_ORIGIN`).

## Letting a client embed the twin

The twin is embedded through `@twindesk/embed-sdk`, which frames `/embed/twin`. Two lists must
agree for a host page to work:

1. **Who may frame the app** (browser-enforced): add the host's hostname to the `map` in
   `deploy/nginx/default.conf.template`, for example
   `twin.meridian.example "'self' https://portal.meridian.example";`.
2. **Who the app will talk to** (app-enforced): the tenant config's `embed.allowedOrigins`. The
   app ignores postMessage traffic from any other origin.

## Checks

- `curl -sI http://localhost:8080/ | grep -i content-security-policy`
- `curl -s http://localhost:8080/healthz` returns `ok`
- [securityheaders.com](https://securityheaders.com) or Mozilla Observatory against a staging URL.
