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

| Route                             | Purpose                                                    |
| --------------------------------- | ---------------------------------------------------------- |
| `GET /health`                     | `{ ok, google: "connected" \| "not-connected" }`           |
| `GET /google/connect`             | Connects the calendar here directly (no app sign-in)       |
| `GET /v1/auth/google/start`       | Sign-in from the app (`?origin=` must be in `APP_ORIGINS`) |
| `GET /v1/auth/google/callback`    | Finishes it: stores calendar access and starts a session   |
| `GET /v1/account`                 | Who is signed in, and which channels the server can use    |
| `/v1/notifications/*`             | The app's notification contract: bell, log, routing, tests |
| `GET /v1/economic`                | The watch on US releases and what is coming up             |
| `PUT`/`DELETE /v1/economic/watch` | Saves or stops the watch (and its channels, if given)      |
| `GET /v1/news`                    | The news followed and the latest items sent                |
| `PUT`/`DELETE /v1/news/watch`     | Saves or stops it (and its channels, if given)             |
| `POST /v1/instructions`           | Claude reads an instruction and proposes the settings      |
| `GET`/`POST /whatsapp/webhook`    | Meta's verification and signed delivery receipts           |

The app reaches `/v1` on its own domain: Vercel rewrites `/v1/*` here (`apps/web/vercel.json`),
and `npm run dev` proxies it when `API_PROXY_TARGET` is set in `apps/web/.env.local`. The session
and CSRF cookies are therefore first-party, and the app's CSP needs no new origin.

**Routing:** each notification goes to the app and to the channels the owner chose for its type
(Notifications → Delivery), using the shared `planDeliveries` rules and quiet hours. Every
outcome, sent, skipped or failed, is stored with the notification, so the app shows it. WhatsApp
needs an approved template per type: `meeting_reminder` covers meeting reminders and tests;
other types are recorded as skipped on WhatsApp until they have one. Email uses Resend and goes
to `EMAIL_TO`, or to the owner's Google account when that is unset.

**US economic releases:** on the Notifications page the owner types an instruction ("remind me
15 minutes before major US releases and send me the figures afterwards"). Claude
(`CLAUDE_MODEL`, structured output, low effort) turns it into settings, which the app shows to
confirm; Claude never changes anything itself and writes none of the messages. Release dates
come from FRED (`FRED_API_KEY`, free) a few times a day, and Fed decision days from the list in
`src/fomc.ts`. Each minute the cron sends due reminders (topic `release`) and, after a release,
checks FRED (or the Fed's press release feed) until the figures arrive, for up to six hours, then
posts them once as published, with the previous figure. No forecasts or consensus figures.
Instructions are capped at 40 a day.

**Figures at release time:** with `BLS_API_KEY` (free), CPI, PPI, the jobs report and job
openings are read from BLS's own API in the first 30 minutes after release, usually within a
minute of 13:30 UK time; FRED covers the rest and is the fallback.

**News:** the owner follows tickers, topics and central banks (same instructions box, or chosen by
hand). Each minute the cron reads the Fed, Bank of England and ECB feeds (rate decisions and
statements only; every 15 minutes outside weekday working hours) and, with `ALPACA_KEY_ID` and
`ALPACA_SECRET_KEY`, Benzinga headlines through Alpaca. A headline tagged with a watched ticker
always matches; for topics, `CLAUDE_FILTER_MODEL` (Haiku, no thinking, at most 1,000 small
requests a day) picks the headlines clearly about one, or the topic's words are matched without
Claude. News goes to the app only by default (topic `news`), as each WhatsApp message costs. Items
are passed on as published, with their source; at most 10 a minute.

**Morning brief:** set on the Notifications page under Briefings (time, days, channels, sections).
The cron sends it once a day at that time, within 30 minutes if a run is missed, and quiet hours
do not hold it. It has six sections:

- markets at the last completed close, with the change on the day: US-listed funds standing in
  for the indices, gold and oil (Alpaca, consolidated prices), Bitcoin (Alpaca), and GBP/USD,
  EUR/USD and EUR/GBP (the ECB's reference rates, from the ECB);
- the biggest moves: the five largest changes either way from the previous close across US
  stocks priced at $5 or more (Alpaca's market movers, names from its asset list), beside the
  S&P 500's move for comparison;
- yesterday in the news: the last 24 hours on the US, wars and conflicts, oil and gold, from the
  BBC's world, US and business feeds and Benzinga's market-wide items. `CLAUDE_FILTER_MODEL` (Haiku)
  writes up to three lines a topic from those stories only, citing them; lines with a bad citation
  or failing the advice checks are dropped. It runs once a day (cached, at most six calls) and,
  without Claude, the headlines are listed as published;
- yesterday's results: the figures yesterday's US releases and any Fed decision published;
- today's US releases and Fed, Bank of England and ECB decisions (`central-banks.ts` lists the last
  two), each marked high or medium severity by its kind of event;
- headlines on what the owner follows from the last 24 hours.

Email carries the whole brief; the app and WhatsApp get a short summary. Only the morning brief is
offered here; the end-of-day recap stays in the demo.

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

For economic release figures, also create a **Utility** template named `release_update`:

> Desk Twin update on {{1}}: {{2}}. Full details and the source are in the Desk Twin app.

Sample values: `{{1}}` "US CPI for October 2026", `{{2}}` "m/m +0.3%, y/y 2.9%, core y/y
3.0%". Until it is approved, figures reach the app (and email) and WhatsApp shows as failed.

## WhatsApp through Twilio

`WHATSAPP_PROVIDER` in `wrangler.jsonc` picks the sender: `meta` (the Cloud API, above) or
`twilio`. With Twilio:

- Secrets: `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`.
- Settings in `wrangler.jsonc`: `TWILIO_WHATSAPP_FROM`, the two content template SIDs and
  `TWILIO_MIN_BALANCE`. WhatsApp stops sending when the balance reaches that floor, which caps
  spending. `TWILIO_STATUS_CALLBACK_URL` turns on signed delivery receipts at `/twilio/status`.
- `npm run twilio:templates` (from the repository root) creates the two templates once and
  prints their SIDs. The wording is "Reminder: {{1}} starts at {{2}}. Sent by Desk Twin." and
  "Desk Twin update on {{1}}: {{2}}. Full details are in the app."
- Twilio's sandbox number delivers only within 24 hours of a message from your phone, and
  WhatsApp cannot approve templates for it. For alerts that arrive every day:
  1. Register your own WhatsApp sender in Twilio (Messaging > Senders > WhatsApp senders).
  2. Run `npm run twilio:templates -- --submit` to ask WhatsApp to approve the templates.
  3. Set `TWILIO_WHATSAPP_FROM` to the new number.

While the sender is the sandbox number, a reminder goes out each evening at `SANDBOX_REMINDER_AT`
(22:30) on WhatsApp and email, asking you to reply "hi" so the next day's messages arrive. It
stops by itself once `TWILIO_WHATSAPP_FROM` is your own number.

A missing WhatsApp setting fails WhatsApp messages only, with the reason in the delivery log.
Email, briefs and the app carry on.

## Market move alerts (IG)

Watch markets from the Notifications page. Each minute the server reads the watched markets from
IG in one request. A market alerts the first time its move on the day reaches each new step, up
or down: with a 1% step, at +1%, +2% and so on, and at −1%, −2% and so on. IG measures the day's
change on the bid, so bid minus change is the previous close; when that changes, a new trading
day has started and the steps begin again. There are at most 40 alerts a day. Alerts use the
`price` routing (the app and WhatsApp by default) and the update template.

Set up once, on IG's API keys page, Demo accounts tab:

1. Create an API key.
2. Set the Web API demo login details: a username different from your live one, and a password.
3. Put `IG_API_KEY`, `IG_USERNAME` and `IG_PASSWORD` in `.dev.vars` and upload them as secrets.

`IG_API_URL` is IG's demo gateway by default. A demo login cannot reach real money, and the
server only ever searches markets and reads prices.

## Email to your own domain

Resend's test sender (`onboarding@resend.dev`) delivers only to the address the Resend account
was opened with. To send anywhere else, such as `hello@yourdomain.com`:

1. In Resend, open Domains, add the domain and add the DNS records it lists where the domain's
   DNS is managed. Wait for the domain to show Verified.
2. Set `RESEND_FROM` in `wrangler.jsonc` to an address on that domain, e.g.
   `Desk Twin <alerts@yourdomain.com>`.
3. Set the recipient: `npx wrangler@4.152.0 secret put EMAIL_TO`.

## Deploying

Vercel deploys the web app. `.github/workflows/deploy-api.yml` deploys this Worker on every push
to `main` that changes server code. It tests first, then applies database migrations and deploys.
It needs two repository secrets (Settings > Secrets and variables > Actions):

- `CLOUDFLARE_API_TOKEN`: create it in Cloudflare (My Profile > API Tokens) from the "Edit
  Cloudflare Workers" template, adding D1 Edit.
- `CLOUDFLARE_ACCOUNT_ID`: shown by `npx wrangler@4.152.0 whoami`.

Secrets are not in Git. Set them once with `npx wrangler@4.152.0 secret put <NAME>`, or all at
once with `secret bulk .dev.vars`.

## Local run

```sh
npx wrangler@4.152.0 d1 migrations apply desk-twin --local
npm run dev -- --test-scheduled      # then: curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
```
