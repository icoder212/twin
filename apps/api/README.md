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

| Route                          | Purpose                                              |
| ------------------------------ | ---------------------------------------------------- |
| `GET /health`                  | `{ ok, google: "connected" \| "not-connected" }`     |
| `GET /google/connect`          | Starts Google sign-in (authorisation code + PKCE)    |
| `GET /google/callback`         | Finishes it; only `OWNER_GOOGLE_ACCOUNT` is accepted |
| `GET`/`POST /whatsapp/webhook` | Meta's verification and signed delivery receipts     |

## Security

- Google tokens are sealed with AES-GCM (`TOKEN_KEY`) before they reach D1; nothing is stored
  in the clear. The sign-in state is sealed too and tied to the browser by a short-lived cookie.
- Only the configured Google account can connect; any other is refused and nothing is saved.
- Webhook bodies are read only when signed with the app secret (`X-Hub-Signature-256`).
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
