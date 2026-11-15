/**
 * Creates the Desk Twin WhatsApp templates in Twilio, once, and prints their content SIDs for
 * apps/api/wrangler.jsonc. Running it again finds the existing ones instead of duplicating them.
 *
 *   npm run twilio:templates                 lists, and creates any that are missing
 *   npm run twilio:templates -- --submit     also asks WhatsApp to approve them (needs your own
 *                                            registered WhatsApp sender, not the sandbox)
 *
 * Reads TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN from .env.local. Creating templates is free.
 */
import { existsSync } from 'node:fs';

const envFile = new URL('../.env.local', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

/** The same wording as the Meta templates the server already uses. */
const TEMPLATES = [
  {
    name: 'desk_twin_reminder',
    setting: 'TWILIO_REMINDER_CONTENT_SID',
    body: 'Reminder: {{1}} starts at {{2}}. Sent by Desk Twin.',
    variables: { 1: 'US CPI release', 2: '13:30' },
  },
  {
    name: 'desk_twin_update',
    setting: 'TWILIO_UPDATE_CONTENT_SID',
    body: 'Desk Twin update on {{1}}: {{2}}. Full details are in the app.',
    variables: { 1: 'your morning brief', 2: '13:30 CPI, 15:00 consumer sentiment' },
  },
];

const sid = process.env.TWILIO_ACCOUNT_SID;
const token = process.env.TWILIO_AUTH_TOKEN;
if (!sid || !token) {
  console.error('\nSet TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env.local.\n');
  process.exit(1);
}
const headers = {
  Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
  'Content-Type': 'application/json',
};

async function call(path, init = {}) {
  const response = await fetch(`https://content.twilio.com/v1/${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(`\nTwilio refused ${path} (${response.status}): ${body.message ?? ''}\n`);
    process.exit(1);
  }
  return body;
}

const existing = (await call('Content?PageSize=100')).contents ?? [];
console.log(`\nTemplates already on the account: ${existing.length}`);
for (const c of existing) console.log(`  ${c.sid}  ${c.friendly_name}`);
console.log('');

for (const template of TEMPLATES) {
  let content = existing.find((c) => c.friendly_name === template.name);
  if (!content) {
    content = await call('Content', {
      method: 'POST',
      body: JSON.stringify({
        friendly_name: template.name,
        language: 'en_GB',
        variables: template.variables,
        types: { 'twilio/text': { body: template.body } },
      }),
    });
    console.log(`Created ${template.name}`);
  }
  console.log(`${template.setting}=${content.sid}`);
  if (process.argv.includes('--submit')) {
    const request = await call(`Content/${content.sid}/ApprovalRequests/whatsapp`, {
      method: 'POST',
      body: JSON.stringify({ name: template.name, category: 'UTILITY' }),
    });
    console.log(`  WhatsApp approval: ${request.status ?? 'requested'}`);
  }
}
console.log('');
