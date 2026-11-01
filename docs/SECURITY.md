# Security

Desk Twin is built for regulated financial firms. This document records the threat model, the
controls already in the client, and the controls the backend must enforce, because a browser can
never be the last line of defence.

## Threat model (summary)

| Threat                                           | Main controls                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Cross-site scripting                             | No HTML rendering anywhere, strict CSP, Trusted Types, lint rules that ban HTML sinks      |
| Session theft or reuse on shared machines        | HttpOnly cookie (production), memory-only session, idle sign-out, cross-tab sign-out       |
| Credential stuffing and enumeration              | MFA, lockout, identical errors for unknown users and wrong passwords                       |
| Personal or account data leaking into AI or logs | PII detection and redaction before sending; audit summaries redacted                       |
| Prompt injection and advice drift                | Intent classification, advice checks as code after generation, no tools in the studio twin |
| Clickjacking and hostile embedding               | `frame-ancestors` allow-list per tenant, sandboxed iframe, exact-origin postMessage        |
| One client seeing another's data                 | Tenant and user scoping in the data layer; never trusted from the client                   |
| Malicious tenant configuration                   | Schema validation: hex-only colours, https or same-origin assets                           |
| Supply chain                                     | Exact pinned versions, lockfile, `npm ci --ignore-scripts` in CI, `npm audit` gate         |

## Controls in this codebase

**Rendering and browser policy**

- Answers, approvals and user text are always rendered as text. `RichText` builds React elements
  from a small formatting subset and never parses HTML; ESLint fails the build on
  `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval` and
  `javascript:` URLs (`eslint.config.js`).
- Content Security Policy with no `unsafe-inline` and no `unsafe-eval` for scripts or styles,
  plus Trusted Types enforcement. It ships as a meta tag in builds and as headers in `vite
preview` and nginx (`apps/web/config/security-headers.ts`, `deploy/nginx`). The production
  build is checked in Chrome with no policy violations. Zod's code generation is switched off
  (`app/strict-csp.ts`) so it never attempts `new Function`.
- Fonts are self-hosted (no third-party requests), `Referrer-Policy`, `Permissions-Policy`,
  `X-Content-Type-Options`, COOP and CORP are set, and nginx adds HSTS.
- Links from citations and notifications pass through `safeUrl` (https or same-origin only, no
  credentials); external links use `rel="noopener noreferrer"`.

**Authentication and sessions**

- Two-step sign-in (password then authenticator code), SSO entry points, lockout after the
  tenant's maximum attempts, and one error message whether the account exists or not.
- No token or session data is written to Web Storage by the app. The production session is an
  HttpOnly cookie; the HTTP client sends credentials and a CSRF header and refuses non-https
  API URLs.
- Idle sign-out with a countdown (tenant-configurable), absolute session lifetime, re-check on
  tab focus, and sign-out broadcast to every open tab. Sign-out clears the query cache and every
  per-user store.
- After sign-in, redirects only go to same-app paths, so a crafted link cannot send users
  off-site. Prompts handed between screens travel in router state, never in the URL.

**Data handling**

- The composer detects card numbers (Luhn-checked), IBANs (mod-97), UK bank details, National
  Insurance numbers, emails, phone numbers, API keys, tokens and passwords, warns the user and
  redacts them before anything is sent.
- All free text is normalised: control characters, bidirectional overrides ("Trojan Source")
  and zero-width characters are removed, and length is capped.
- Audit summaries are redacted before they are stored. CSV exports neutralise spreadsheet
  formulas.
- API keys for connected sources are sent once to the vault endpoint and never kept in client
  state, logs or responses. Only read-only keys are accepted, with explicit confirmation.

**Authorisation and isolation**

- Role-to-permission map in `core/security/rbac.ts`, used for UI gating. The mock adapter
  enforces it on every call, the way the real API must.
- Per-tenant, per-user data namespaces in the mock, mirroring row-level security.
- The embed bridge accepts messages only from the parent window, only from an exact allowed
  origin, and only when they parse as a known message type.

## What the backend must enforce

- Authentication on every request; HttpOnly, Secure, SameSite cookies; CSRF validation;
  rotation on privilege change; server-side idle and absolute timeouts; MFA enforcement.
- Authorisation with the same permission map, and tenant and user isolation in SQL (row-level
  security), never derived from request parameters.
- Rate limits per user, per IP and per tenant; lockout; anomaly alerts on failed sign-ins.
- The advice checks and PII redaction server-side, as the gate that decides what is shown.
- Append-only audit storage with retention set per tenant; answers retrievable by id.
- Secrets in a managed vault, encryption in transit and at rest, regional hosting (UK option),
  no training on customer data, and providers configured to exclude it where they allow.
- Security headers at the edge (see `deploy/nginx`), including the tenant's `frame-ancestors`.

## Demo-only shortcuts

These exist only in mock builds and are removed from builds with `VITE_API_MODE=http`:

- Demo accounts, the shared demo password and the fixed authenticator code.
- The mock keeps its session and demo data in `sessionStorage`, which is cleared when the tab
  closes. Production uses an HttpOnly cookie and the server's database.

## Before production

Independent penetration test; dependency and container scanning in CI; a DPIA under UK GDPR;
an agreed evaluation set and pass criteria for the advice checks; log retention and access
policy signed by compliance; incident response runbook; and the controls mapped to the firm's
framework (for example ISO 27001 or SOC 2).
