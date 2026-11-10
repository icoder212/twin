# Desk Twin server (Cloudflare Workers)

First slice of the backend: a WhatsApp reminder before each of the owner's meetings, read from
their Google Calendar, whether or not the app is open. It reuses `@twindesk/core` (the Google
Calendar mapping, sanitising and formatting) and grows into the full API with real sign-in.

**How it works:** the owner connects Google once at `/google/connect` (read-only calendar, plus
their address to check it is the owner). A cron trigger runs every minute, reads the next few
minutes of the calendar, and sends the approved `meeting_reminder` template through the
WhatsApp Cloud API for each timed meeting starting within `REMINDER_MINUTES`. Each meeting is
reminded once; declined and all-day events are skipped. Delivery receipts arrive on
`/whatsapp/webhook`.

| Route                          | Purpose                                                    |
| ------------------------------ | ---------------------------------------------------------- |
| `GET /health`                  | `{ ok, google: "connected" \| "not-connected" }`           |
| `GET /google/connect`          | Connects the calendar here directly (no app sign-in)       |
| `GET /v1/auth/google/start`    | Sign-in from the app (`?origin=` must be in `APP_ORIGINS`) |
| `GET /v1/auth/google/callback` | Finishes it: stores calendar access and starts a session   |
| `GET /v1/account`              | Who is signed in, and which channels the server can use    |
| `/v1/notifications/*`          | The app's notification contract: bell, log, routing, tests |
| `GET`/`POST /whatsapp/webhook` | Meta's verification and signed delivery receipts           |

The app reaches `/v1` on its own domain: Vercel rewrites `/v1/*` here (`apps/web/vercel.json`),
and `npm run dev` proxies it when `API_PROXY_TARGET` is set in `apps/web/.env.local`. The session
and CSRF cookies are therefore first-party, and the app's CSP needs no new origin.

**Routing:** each notification goes to the app and to the channels the owner chose for its type
(Notifications → Delivery), using the shared `planDeliveries` rules and quiet hours. Every
outcome, sent, skipped or failed, is stored with the notification, so the app shows it. WhatsApp
needs an approved template per type: `meeting_reminder` covers meeting reminders and tests;
other types are recorded as skipped on WhatsApp until they have one. Email uses Resend.

## Security

- Google tokens are sealed with AES-GCM (`TOKEN_KEY`) before they reach D1; nothing is stored
  in the clear. The sign-in state is sealed too and tied to the browser by a short-lived cookie.
- Only the configured Google account can connect; any other is refused and nothing is saved.
- Webhook bodies are read only when signed with the app secret (`X-Hub-Signature-256`).
- App sessions: a random token in an HttpOnly `__Host-` cookie (only its hash is stored), 12-hour
  lifetime. Changes need the CSRF token from the readable `twindesk_csrf` cookie, the app's
  `X-Requested-With` header and, when sent, an `Origin` in `APP_ORIGINS`.
- Logs carry counts, statuses and error messages only: no tokens, numbers or event titles.
- Every deployment-specific value is a secret. `wrangler.jsonc` holds nothing personal.

## Set up (once)

Wrangler is run through `npx` at a pinned version, so the web app's installs stay small.

```sh
cd apps/api
npx wrangler@4.152.0 login
npx wrangler@4.152.0 d1 create desk-twin          # copy the database_id into wrangler.jsonc
npx wrangler@4.152.0 d1 migrations apply desk-twin --remote
cp .dev.vars.example .dev.vars                    # fill it in; git ignores it
npx wrangler@4.152.0 secret bulk .dev.vars
npm run deploy                                    # prints https://desk-twin-api.<you>.workers.dev
```

Then:

1. **Google:** in Google Auth Platform → Clients → Desk Twin web, add the redirect URI
   `https://desk-twin-api.<you>.workers.dev/google/callback` (and
   `http://localhost:8787/google/callback` for local runs). Add a client secret if the client
   has none you can copy, and put it in `.dev.vars`.
2. **Connect:** open `https://desk-twin-api.<you>.workers.dev/google/connect`, sign in as the
   owner and allow calendar access. `/health` then shows `"google": "connected"`.
3. **Delivery receipts (optional):** in the Meta app, WhatsApp → Configuration → Webhook, set
   the callback URL to `.../whatsapp/webhook`, the verify token to `WHATSAPP_VERIFY_TOKEN`, and
   subscribe to `messages`.

## WhatsApp template

Create a **Utility** template named `meeting_reminder` in English (UK):

> Reminder: {{1}} starts at {{2}}. Sent by Desk Twin.

`{{1}}` is the event title (one line, at most 60 characters) and `{{2}}` the start time in
`TIMEZONE`. Until it is approved, sends fail and are retried each minute while the meeting is
still ahead. Meta's test number only delivers to the recipients added on the API Setup page.

## Local run

```sh
npx wrangler@4.152.0 d1 migrations apply desk-twin --local
npm run dev -- --test-scheduled      # then: curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
```
