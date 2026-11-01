# Architecture

Desk Twin will run in three places: as a standalone web app, inside client platforms under their
brand, and as a mobile app. It will also move from a demo backend to a SQL database and AI
services. The architecture is shaped so that each of those is an addition, not a rewrite.

## Principles

1. **One contract, many adapters.** Every screen talks to the `TwinDeskApi` interface
   (`packages/core/src/api/contracts.ts`). Today the mock adapter serves it in the browser;
   `createHttpApi` already implements it over HTTPS. Switching is one environment variable.
2. **Schemas are the source of truth.** Domain types are inferred from Zod schemas, so the same
   definition gives compile-time types and runtime validation of API responses, tenant configs,
   postMessage payloads and form input. The backend can import them too.
3. **Platform-agnostic core.** `packages/core` has no React and no DOM dependency beyond
   `fetch`, `URL` and `crypto.getRandomValues`, so it runs in the browser, in Node and in React
   Native unchanged.
4. **Feature folders.** Each feature owns its pages, components and data hooks
   (`features/<name>/queries.ts`). Features depend on `shared/` and `core`, rarely on each other.
5. **The server is the authority.** Route guards, hidden buttons and client-side checks shape the
   UI; the API enforces authentication, permissions, tenant isolation and the advice checks.

## Layers

```
┌──────────────────────────── apps/web ─────────────────────────────┐
│ features/*        pages and components, per feature               │
│ features/*/queries.ts   TanStack Query hooks (cache, invalidation)│
│ shared/ui         design system on semantic tokens               │
│ platform/         picks the adapter, provides it via context      │
└───────────────────────────────┬───────────────────────────────────┘
                                │ TwinDeskApi (contract)
┌──────────────────────────── packages/core ────────────────────────┐
│ domain/           Zod schemas and types                           │
│ api/              contract, HTTP client, SSE reader, errors       │
│ security/         RBAC, sanitising, PII detection, safe URLs      │
│ compliance/       eight advice checks, question intent            │
│ tenants/          validated white-label presets                   │
│ mock/             in-memory backend implementing the contract     │
└───────────────────────────────────────────────────────────────────┘
```

## State management

| Kind of state            | Where it lives                                   | Why                                        |
| ------------------------ | ------------------------------------------------ | ------------------------------------------ |
| Server data              | TanStack Query (`app/query-keys.ts`)             | caching, refetch, invalidation, retries    |
| Session                  | Zustand store, memory only                       | never in Web Storage; cookie in production |
| Conversation             | Zustand store, memory only                       | wiped on sign-out, never persisted         |
| Tenant and colour scheme | React context; scheme preference in localStorage | non-sensitive preference only              |
| Forms                    | react-hook-form with the core Zod schemas        | same validation as the server              |

Stores holding per-user data register a reset with `registerSessionReset`; sign-out clears them
and the whole query cache, and is broadcast to every tab.

## The answer pipeline

The twin's answers stream as typed events, the same shape the backend will send as
server-sent events:

```
routed     → the router agent picked a specialist (and why)
retrieved  → passages the research agent found, with library size
checked    → eight advice checks on a draft (a blocked draft appears here, never its text)
delta      → answer text, only after the final draft has passed
done       → the full answer: id, citations, checks, drafts, models, latency
```

`features/twin/use-ask.ts` folds these into the conversation; the Inspector shows every stage.
The mock engine (`packages/core/src/mock/twin-engine.ts`) emits exactly this sequence.

## Connecting the backend

1. Build the API to the contract. `packages/core/src/api/http-api.ts` lists every endpoint; for
   example `POST /v1/auth/login`, `POST /v1/twin/ask` (SSE), `GET /v1/approvals`,
   `POST /v1/approvals/:id/decision`, `GET /v1/audit`, `PUT /v1/notifications/preferences`,
   `POST /v1/notifications/contacts/verify`, `GET /v1/notifications/events`,
   `PUT /v1/briefings/:kind`.
2. Build with `VITE_API_MODE=http` and `VITE_API_BASE_URL=https://api…`. The demo backend and
   its credentials are then excluded from the bundle, and the CSP `connect-src` picks up the
   API origin.
3. Sessions use an HttpOnly, Secure, SameSite cookie set by the API. Mutating requests send the
   `X-CSRF-Token` header from the `twindesk_csrf` cookie (double-submit). The client never sees
   or stores a token.
4. Responses are validated against the schemas; anything unexpected becomes a safe error rather
   than a broken screen.

### Suggested data model (SQL)

Every table carries `tenant_id`, and row-level security (for example PostgreSQL RLS) restricts
each request to its tenant and, for trader data, to its user. The audit table is append-only.

```
tenants(id, config jsonb)                 users(id, tenant_id, email, role, desk_type)
sessions(id, user_id, expires_at, ...)    sources(id, tenant_id, user_id, provider, scopes, vault_ref)
automations(id, tenant_id, user_id, kind, plan jsonb, status)   automation_runs(...)
alerts(...)    approvals(id, ..., status, decided_by, decided_at)
answers(id 'DT-…', tenant_id, user_id, question, text, citations jsonb, checks jsonb,
        models jsonb, library_version, latency_ms, created_at)
audit_events(id, tenant_id, actor, action, outcome, summary, ref, at)   -- append-only
notification_preferences(user_id, routing jsonb, quiet_hours jsonb, digest jsonb,
        escalation jsonb, privacy)
contacts(id, user_id, channel, address_encrypted, verified_at, consent_at)
notification_events(id 'NT-…', tenant_id, user_id, topic, urgency, title, body, created_at,
        acknowledged_at, escalation jsonb)
deliveries(event_id, channel, status, destination_masked, provider_ref, note, at)  -- append-only
briefing_schedules(user_id, kind, enabled, time, days, channels, sections, last_sent_at)
```

### AI integration

The model never runs in the browser and no AI key ever reaches it. The server runs the agent
team: a small fast model as router, retrieval over the tenant's library (with per-user
filtering in the data layer), a specialist model that drafts from retrieved passages only, and
the advice checks from `packages/core/src/compliance` as code after generation, with one rewrite
and then withholding. Models are configuration and are recorded on every answer (the mock records
`claude-haiku-5-5` for routing and `claude-sonnet-5-5` for drafting). Numbers come from rule
engines and detectors, never from the model.

### Notifications

`packages/core/src/notifications` holds the rules both sides share: `planDeliveries` decides,
per channel, whether a notification is sent, held (quiet hours or the daily summary) or skipped
(firm policy or no verified contact); `planEscalation` decides who hears about an unacknowledged
critical alert; `renderMessage` produces the exact wording per channel, including the minimal
form that keeps figures inside the app. The server runs the same functions when an alert fires,
then hands each delivery to a provider (an email service, the WhatsApp Business Platform, a
Teams bot, an SMS gateway, APNs and FCM) through a queue, with retries and delivery receipts
written back to `deliveries`. A scheduled job sends briefings and escalations.

## Embedding in client platforms

Host platforms embed the twin through `@twindesk/embed-sdk`, which mounts the `/embed/twin`
route in a sandboxed iframe on the twin's own origin. The iframe boundary isolates the twin's
DOM, storage and traffic from the host; the two sides exchange only typed, schema-checked
messages after an exact origin check, and `frame-ancestors` limits which hosts may frame it.
See [White-label](WHITE_LABEL.md).

## Mobile

The recommended path is an Expo (React Native) app that reuses `packages/core` as is: schemas,
the API contract and HTTP client, the advice checks, PII detection and formatting. The mobile app
supplies its own UI and two platform adapters: a `KeyValueStore` backed by SecureStore, and
`react-native-get-random-values` for ids. Authentication should use OAuth 2.0 with PKCE and keep
tokens in the device keychain. The web app is already responsive and installable (web manifest,
safe-area insets) if a wrapped web app is wanted sooner.

## Adding a feature

1. Add or extend schemas in `packages/core/src/domain`, then the contract in `api/contracts.ts`,
   then both adapters (`mock/mock-api.ts` and `api/http-api.ts`).
2. Add query keys in `apps/web/src/app/query-keys.ts` and hooks in `features/<name>/queries.ts`.
3. Build the page from `shared/ui` components and semantic tokens only.
4. Register a lazy route in `app/router.tsx` behind `RequireFeature` or `RequirePermission`, and
   add it to `features/shell/nav.ts`.
5. Run `npm run verify`.
