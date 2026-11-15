# Desk Twin

An AI twin of a trading desk that never gives advice. It answers from the user's own rules,
history and notes, cites its sources, and runs every answer through eight advice checks before
anyone sees it. Product reference: <https://www.alchmai.com/desk-twin>.

This repository is the client platform: a React and TypeScript web app, a platform-agnostic core
shared with the future mobile app and backend, and an SDK for embedding the twin inside client
platforms under their own brand.

> **Status:** demo-ready UI with an in-browser mock backend. The SQL database and the AI services
> plug in behind an API contract that already exists (see [Architecture](docs/ARCHITECTURE.md)).

## Quick start

```bash
nvm use            # Node 22
npm install
npm run dev        # http://localhost:5173
```

Sign in with any demo account (they are listed on the sign-in page in demo builds):

| Account                        | Role          | Desk                |
| ------------------------------ | ------------- | ------------------- |
| `alex.morgan@demo.alchmai.com` | Trader        | Independent traders |
| `priya.shah@demo.alchmai.com`  | Compliance    | Prop firms          |
| `sam.okafor@demo.alchmai.com`  | Administrator | Brokers             |

The password is shared directly, not written here: the deployed demo checks it against a hash
(`DEMO_PASSWORD_SHA256` in `apps/web/src/app/env.ts`, or `VITE_DEMO_PASSWORD_SHA256` to change it
without a code change). Tests and local tools without a hash use `DEMO_PASSWORD` from the mock.
The authenticator code is `246810`. Demo credentials exist only in mock builds; a build pointed
at the real API contains none of them.

### Showing it to a client

- **Try to break it:** in _Ask the twin_, ask "Should I buy EURUSD now?". It declines, and the
  Inspector shows the first draft blocked by the forecast check and rewritten.
- **Shortcuts:** type `/` in the composer, or press `⌘K` anywhere. `/prep`, `/recap` (creates an
  approval), `/alert EURUSD 1.0900` (creates an alert), `/payout 10482`.
- **Personal data guard:** paste a card number into the composer; it is flagged and removed
  before sending.
- **White-label:** _Settings → White-label_ switches between AlchmAI, Northbridge (prop firm)
  and Meridian (broker), or add `?tenant=meridian` to the sign-in URL. The same tab previews the
  twin embedded in a host platform.
- **Roles:** sign in as Priya (compliance) to see firm-wide audit, CSV export and read-only
  automation screens.
- **Idle sign-out:** after 15 minutes without activity (10 for Northbridge), with a countdown.
- **Notifications:** _Notifications_ chooses where each urgency goes (app, phone push, email,
  WhatsApp, Teams, text), quiet hours, a daily summary, escalation and minimal wording, with a
  preview of each message. _Send a test critical notification_, then watch it escalate in the
  delivery log after 5 minutes unless you acknowledge it. Add a contact with code `246810`.
  Under Meridian, WhatsApp and texts are turned off by the firm policy.
- **Briefings:** the morning brief and end-of-day recap run on a schedule, with a preview and
  _Send now_.
- **Source health:** _Connected sources_ shows 24 hours of fetch history, retries, and an
  alert when a source stops fetching.
- **Your real notifications:** with the server deployed (`apps/api`), _Notifications_ offers
  _Sign in with Google_ for the owner's account. The bell, the delivery log and the routing table
  then show and control real notifications: meeting reminders, and what went to WhatsApp and
  email. _Back to the demo_ switches back. Each alert type has its own channels.
- **Your real Google Calendar:** in a build with `VITE_GOOGLE_CLIENT_ID` set, connect Google
  Calendar from the dashboard or _Sources_. Your next 7 days appear on the dashboard, a reminder
  shows in the app 10 minutes before each event, and the twin answers "What's on my calendar
  today?" or "When is my next meeting?" from it. Access is read-only, held in the browser tab's
  memory for up to an hour, and never stored. Setup: [deploy/README.md](deploy/README.md#google-calendar-in-the-demo).

## Scripts

| Command                 | What it does                                                          |
| ----------------------- | --------------------------------------------------------------------- |
| `npm run dev`           | Vite dev server with security headers (CSP off for hot reload)        |
| `npm run build`         | Type-check and build `apps/web/dist` with the CSP meta tag            |
| `npm run preview`       | Serve the build with the full production CSP and headers              |
| `npm run verify`        | Type-check, lint, test and build: what CI runs                        |
| `npm test`              | Vitest: core (node) and web (jsdom) projects                          |
| `npm run lint`          | ESLint with security and accessibility rules, zero warnings           |
| `npm run format`        | Prettier, with Tailwind class sorting                                 |
| `npm run audit:deps`    | `npm audit` of production dependencies                                |
| `npm run whatsapp:test` | Shows, or with `-- --send` sends, a test alert to one WhatsApp number |

## Repository layout

```
apps/web/              React web app (standalone, and the embeddable /embed/twin route)
  config/              Security headers and CSP, shared by Vite and documented for nginx
  src/app/             Bootstrap, router, query client, env validation
  src/features/<name>/ One folder per feature: pages, components, queries.ts
  src/shared/          Design system (ui/), shared components and hooks
  src/platform/        API adapter selection and context
apps/api/              Cloudflare Worker: WhatsApp reminders before the owner's meetings (first
                       backend slice; see apps/api/README.md)
packages/core/         Platform-agnostic TypeScript: domain schemas, API contract, HTTP and SSE
                       clients, security utilities, advice checks, tenant presets, mock backend
packages/embed-sdk/    Dependency-free SDK for host platforms (sandboxed iframe + postMessage)
deploy/                Dockerfile and nginx config with production security headers
docs/                  Architecture, security and white-label guides
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md): layers, data flow, and the path to the backend, AI and mobile
- [Security](docs/SECURITY.md): threat model, controls in place, and what the server must enforce
- [White-label](docs/WHITE_LABEL.md): tenant configuration, theming and embedding
- [Deployment](deploy/README.md): container image and nginx headers

## Tech stack

React 19, TypeScript 5.9 (strict), Vite 7, Tailwind CSS 4, React Router 7, TanStack Query 5,
Zustand 5, Zod 4, react-hook-form, Radix primitives, Vitest 4 and Testing Library, ESLint 9 with
`jsx-a11y` and `no-unsanitized`, Playwright (installed for end-to-end checks).
