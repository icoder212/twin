/**
 * Sends one Desk Twin test alert to a WhatsApp number, to check wording and delivery end to end.
 * It runs on your machine only: provider tokens must never be built into the web app.
 *
 *   npm run whatsapp:test                       shows the message and where it would go
 *   npm run whatsapp:test -- --send             sends it
 *   npm run whatsapp:test -- --privacy=standard uses standard wording instead of minimal
 *
 * Settings are read from .env.local in the repository root (git ignores it):
 *
 *   WHATSAPP_TEST_TO=+447700900123      the one number to send to, international format
 *   WHATSAPP_PROVIDER=twilio            or meta
 *
 *   Twilio WhatsApp Sandbox (join it from your phone first):
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
 *   TWILIO_WHATSAPP_FROM=+14155238886   the sandbox number; change it for your own sender
 *   TWILIO_CONTENT_SID=HX...            send this Twilio template instead of the Desk Twin text,
 *   TWILIO_CONTENT_VARIABLES={"1":"..."} for accounts that only accept templates (trial accounts)
 *   TWILIO_MIN_BALANCE=10               refuse to send when the balance is at or below this
 *
 *   Meta WhatsApp Cloud API (add your number as a test recipient first):
 *   META_WHATSAPP_TOKEN, META_PHONE_NUMBER_ID
 *   META_TEMPLATE=hello_world           any other approved template gets 3 body parameters
 *   META_TEMPLATE_LANGUAGE=en_US
 *   META_GRAPH_VERSION=v23.0            use the version shown on your API setup page
 */
import { existsSync } from 'node:fs';
import { createJiti } from 'jiti';

const envFile = new URL('../.env.local', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const core = await createJiti(import.meta.url).import('../packages/core/src/index.ts');

const args = process.argv.slice(2);
const send = args.includes('--send');
const privacy = args.includes('--privacy=standard') ? 'standard' : 'minimal';
const provider = process.env.WHATSAPP_PROVIDER;

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function required(name) {
  const value = process.env[name];
  if (!value) fail(`Set ${name} in .env.local.`);
  return value;
}

const parsed = core.startVerificationInputSchema.safeParse({
  channel: 'whatsapp',
  address: required('WHATSAPP_TEST_TO'),
  consent: true,
});
if (!parsed.success) fail(`WHATSAPP_TEST_TO: ${parsed.error.issues[0]?.message}`);
const to = parsed.data.address;

const event = {
  ref: core.createNotificationRef(),
  topic: 'test',
  urgency: 'critical',
  title: 'Test: critical alert',
  body: 'This is how critical alerts reach you. Acknowledge it in the app to stop the escalation.',
};
const message = core.renderMessage(event, 'whatsapp', { productName: 'Desk Twin', privacy });
const text = `*${message.title}*\n${message.body}\n\n_${message.footer}_`;

// The same gate as every message the app sends.
const checks = core.runAdviceChecks(text, {
  requiresCitations: false,
  citedIndexes: [],
  retrievedIndexes: [],
});
if (!core.allPassed(checks)) fail('The message failed the advice checks, so it was not sent.');

const template = process.env.META_TEMPLATE ?? 'hello_world';
console.log(`\nProvider: ${provider ?? 'not set'}`);
console.log(`To:       ${core.maskAddress('whatsapp', to)}`);
console.log(`Ref:      ${event.ref}\n`);
const contentSid = process.env.TWILIO_CONTENT_SID;
console.log(
  provider === 'meta' && template === 'hello_world'
    ? 'Meta sends its own "hello_world" template until a Desk Twin template is approved.\n'
    : provider === 'twilio' && contentSid
      ? `Twilio sends template ${contentSid}, not the Desk Twin wording below.\n\n${text}\n`
      : `${text}\n`,
);

if (!send) {
  console.log('Nothing was sent. Add --send to send it.\n');
  process.exit(0);
}

async function postJson(url, init) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
}

async function twilioBalance(sid, authorization) {
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Balance.json`,
    { headers: { Authorization: authorization }, signal: AbortSignal.timeout(15_000) },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) fail(`Could not read the Twilio balance (${response.status}).`);
  return { amount: Number(body.balance), currency: body.currency };
}

async function sendWithTwilio() {
  const sid = required('TWILIO_ACCOUNT_SID');
  const token = required('TWILIO_AUTH_TOKEN');
  const from = process.env.TWILIO_WHATSAPP_FROM ?? '+14155238886';
  const authorization = `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`;
  // A spending guard: one message costs pennies, but never let the balance fall past the floor.
  const floor = Number(process.env.TWILIO_MIN_BALANCE ?? 'NaN');
  if (!Number.isFinite(floor)) fail('Set TWILIO_MIN_BALANCE in .env.local, e.g. 10.');
  const balance = await twilioBalance(sid, authorization);
  console.log(
    `Balance:  ${balance.amount.toFixed(2)} ${balance.currency} (floor ${floor.toFixed(2)})`,
  );
  if (!(balance.amount > floor + 0.5)) {
    fail('The balance is too close to the floor you set, so nothing was sent.');
  }
  const result = await postJson(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: `whatsapp:${from}`,
        To: `whatsapp:${to}`,
        ...(contentSid
          ? {
              ContentSid: contentSid,
              ...(process.env.TWILIO_CONTENT_VARIABLES
                ? { ContentVariables: process.env.TWILIO_CONTENT_VARIABLES }
                : {}),
            }
          : { Body: text }),
      }),
    },
  );
  if (!result.ok) {
    // Some accounts, including every trial account, accept WhatsApp messages only as templates.
    const hint =
      /ContentSid/i.test(result.body.message ?? '') && !contentSid
        ? '\nThis account only sends WhatsApp templates. Set TWILIO_CONTENT_SID to a template, such as the sample on the sandbox page, or upgrade the account to create a Desk Twin template.'
        : '';
    fail(
      `Twilio did not accept it (${result.status}, error ${result.body.code ?? 'unknown'}): ${result.body.message ?? ''}${result.body.more_info ? `\n${result.body.more_info}` : ''}${hint}`,
    );
  }
  return `${result.body.sid} (${result.body.status})`;
}

async function sendWithMeta() {
  const token = required('META_WHATSAPP_TOKEN');
  const phoneNumberId = required('META_PHONE_NUMBER_ID');
  const version = process.env.META_GRAPH_VERSION ?? 'v23.0';
  // Template parameters cannot contain line breaks.
  const parameters = [message.title, message.body.replace(/\s*\n\s*/g, ' '), event.ref];
  const result = await postJson(
    `https://graph.facebook.com/${encodeURIComponent(version)}/${encodeURIComponent(phoneNumberId)}/messages`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to.slice(1),
        type: 'template',
        template: {
          name: template,
          language: { code: process.env.META_TEMPLATE_LANGUAGE ?? 'en_US' },
          ...(template === 'hello_world'
            ? {}
            : {
                components: [
                  {
                    type: 'body',
                    parameters: parameters.map((value) => ({ type: 'text', text: value })),
                  },
                ],
              }),
        },
      }),
    },
  );
  if (!result.ok)
    fail(`Meta did not accept it (${result.status}): ${result.body.error?.message ?? ''}`);
  return result.body.messages?.[0]?.id ?? 'no message id returned';
}

if (provider !== 'twilio' && provider !== 'meta') fail('Set WHATSAPP_PROVIDER to twilio or meta.');
const id = provider === 'twilio' ? await sendWithTwilio() : await sendWithMeta();
console.log(`Sent. Provider message id: ${id}\n`);
