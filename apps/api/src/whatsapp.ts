import { sanitizeText } from '@twindesk/core';
import type { Config } from './config';
import { hmacSha1Base64, hmacSha256Hex, timingSafeEqual } from './crypto';

export class WhatsAppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WhatsAppError';
  }
}

/** Template parameters cannot hold line breaks, tabs or runs of spaces; keep them short too. */
export function templateText(value: string, max = 60): string {
  const text = sanitizeText(value, { maxLength: 1000, multiline: false });
  if (!text) return 'Untitled event';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * An approved template and the values for its placeholders, in order. `kind` picks the matching
 * template on each provider: Meta's by name, Twilio's by content SID.
 */
export interface WhatsAppTemplate {
  kind: 'reminder' | 'update';
  name: string;
  params: string[];
}

/** The approved utility template: "Reminder: {{1}} starts at {{2}}. Sent by Desk Twin." */
export function reminderTemplate(config: Config, title: string, time: string): WhatsAppTemplate {
  return { kind: 'reminder', name: config.WHATSAPP_TEMPLATE, params: [templateText(title), time] };
}

/**
 * "Desk Twin update on {{1}}: {{2}}. Full details are in the app." Without one set up, updates
 * reach the app and email only.
 */
export function updateTemplate(
  config: Config,
  subject: string,
  details: string,
): WhatsAppTemplate | undefined {
  const ready =
    config.WHATSAPP_PROVIDER === 'twilio'
      ? config.TWILIO_UPDATE_CONTENT_SID
      : config.WHATSAPP_UPDATE_TEMPLATE;
  if (!ready) return undefined;
  return {
    kind: 'update',
    name: config.WHATSAPP_UPDATE_TEMPLATE ?? 'release_update',
    params: [templateText(subject), templateText(details, 200)],
  };
}

export function templateMessage(config: Config, template: WhatsAppTemplate) {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: config.WHATSAPP_TO,
    type: 'template',
    template: {
      name: template.name,
      language: { code: config.WHATSAPP_TEMPLATE_LANGUAGE },
      components: [
        {
          type: 'body',
          parameters: template.params.map((text) => ({ type: 'text', text })),
        },
      ],
    },
  };
}

/** The settings the chosen provider still needs, by name. Empty when WhatsApp is ready. */
export function missingWhatsAppSettings(config: Config): string[] {
  const needed =
    config.WHATSAPP_PROVIDER === 'twilio'
      ? ([
          'TWILIO_ACCOUNT_SID',
          'TWILIO_AUTH_TOKEN',
          'TWILIO_WHATSAPP_FROM',
          'TWILIO_REMINDER_CONTENT_SID',
        ] as const)
      : (['WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_TOKEN'] as const);
  return needed.filter((name) => config[name] === undefined);
}

/** Sends one template message through the configured provider and returns its message id. */
export async function deliverWhatsApp(
  config: Config,
  template: WhatsAppTemplate,
  fetchFn: typeof fetch,
): Promise<string> {
  const missing = missingWhatsAppSettings(config);
  if (missing.length > 0) {
    throw new WhatsAppError(`WhatsApp is not set up: missing ${missing.join(', ')}`);
  }
  return config.WHATSAPP_PROVIDER === 'twilio'
    ? sendWithTwilio(config, template, fetchFn)
    : sendWhatsApp(config, templateMessage(config, template), fetchFn);
}

/** Sends through the WhatsApp Cloud API and returns Meta's message id. */
export async function sendWhatsApp(
  config: Config,
  message: ReturnType<typeof templateMessage>,
  fetchFn: typeof fetch,
): Promise<string> {
  const url = `https://graph.facebook.com/${config.GRAPH_API_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID ?? ''}/messages`;
  const response = await fetchFn(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.WHATSAPP_TOKEN ?? ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });
  const data = (await response.json().catch(() => null)) as {
    messages?: Array<{ id?: unknown }>;
    error?: { message?: unknown; code?: unknown };
  } | null;
  if (!response.ok) {
    const detail = typeof data?.error?.message === 'string' ? data.error.message.slice(0, 200) : '';
    const code = typeof data?.error?.code === 'number' ? `, code ${data.error.code}` : '';
    throw new WhatsAppError(
      `WhatsApp refused the message (${response.status}${code}) ${detail}`.trim(),
    );
  }
  const id = data?.messages?.[0]?.id;
  if (typeof id !== 'string') throw new WhatsAppError('WhatsApp sent no message id');
  return id;
}

const TWILIO_API = 'https://api.twilio.com/2010-04-01/Accounts';

function twilioAuth(config: Config): string {
  return `Basic ${btoa(`${config.TWILIO_ACCOUNT_SID ?? ''}:${config.TWILIO_AUTH_TOKEN ?? ''}`)}`;
}

/** The account balance, read before each send so spending stops at the floor the owner set. */
async function twilioBalance(config: Config, fetchFn: typeof fetch): Promise<number> {
  const response = await fetchFn(
    `${TWILIO_API}/${encodeURIComponent(config.TWILIO_ACCOUNT_SID ?? '')}/Balance.json`,
    { headers: { Authorization: twilioAuth(config) } },
  );
  const data = (await response.json().catch(() => null)) as { balance?: unknown } | null;
  const balance = Number(data?.balance);
  if (!response.ok || !Number.isFinite(balance)) {
    throw new WhatsAppError(`Could not check the Twilio balance (${response.status})`);
  }
  return balance;
}

/**
 * Sends through Twilio with a content template, so it arrives whenever it is due rather than
 * only within 24 hours of a message from the owner. Returns Twilio's message SID.
 */
async function sendWithTwilio(
  config: Config,
  template: WhatsAppTemplate,
  fetchFn: typeof fetch,
): Promise<string> {
  const contentSid =
    template.kind === 'reminder'
      ? config.TWILIO_REMINDER_CONTENT_SID
      : config.TWILIO_UPDATE_CONTENT_SID;
  if (!contentSid) throw new WhatsAppError('No Twilio template is set up for this message');
  if (config.TWILIO_MIN_BALANCE !== undefined) {
    const balance = await twilioBalance(config, fetchFn);
    if (balance <= config.TWILIO_MIN_BALANCE) {
      throw new WhatsAppError(
        `Not sent: the Twilio balance (${balance.toFixed(2)}) is at the spending floor you set`,
      );
    }
  }
  const variables = Object.fromEntries(template.params.map((value, i) => [String(i + 1), value]));
  const form = new URLSearchParams({
    From: `whatsapp:${config.TWILIO_WHATSAPP_FROM ?? ''}`,
    To: `whatsapp:+${config.WHATSAPP_TO}`,
    ContentSid: contentSid,
    ContentVariables: JSON.stringify(variables),
  });
  if (config.TWILIO_STATUS_CALLBACK_URL)
    form.set('StatusCallback', config.TWILIO_STATUS_CALLBACK_URL);
  const response = await fetchFn(
    `${TWILIO_API}/${encodeURIComponent(config.TWILIO_ACCOUNT_SID ?? '')}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: twilioAuth(config),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    },
  );
  const data = (await response.json().catch(() => null)) as {
    sid?: unknown;
    code?: unknown;
    message?: unknown;
  } | null;
  if (!response.ok) {
    const detail = typeof data?.message === 'string' ? data.message.slice(0, 200) : '';
    const code = typeof data?.code === 'number' ? `, Twilio ${data.code}` : '';
    throw new WhatsAppError(
      `WhatsApp refused the message (${response.status}${code}) ${detail}`.trim(),
    );
  }
  if (typeof data?.sid !== 'string') throw new WhatsAppError('Twilio sent no message id');
  return data.sid;
}

/**
 * Twilio signs each webhook: base64 HMAC-SHA1, keyed with the auth token, of the exact URL it
 * called followed by every form field's name and value, sorted by name.
 */
export async function verifyTwilioSignature(
  authToken: string,
  url: string,
  form: URLSearchParams,
  header: string | null,
): Promise<boolean> {
  if (!header) return false;
  const signed = [...form.keys()]
    .filter((key, i, keys) => keys.indexOf(key) === i)
    .sort()
    .map((key) =>
      form
        .getAll(key)
        .map((value) => `${key}${value}`)
        .join(''),
    )
    .join('');
  return timingSafeEqual(header, await hmacSha1Base64(authToken, `${url}${signed}`));
}

/** The delivery receipt in a Twilio status callback, if it is a well-formed one. */
export function twilioStatus(form: URLSearchParams): { id: string; status: string } | null {
  const id = form.get('MessageSid') ?? '';
  const status = form.get('MessageStatus') ?? '';
  if (!/^(?:SM|MM)[0-9a-f]{32}$/.test(id) || !/^[a-z]{1,20}$/.test(status)) return null;
  return { id, status };
}

/** Meta signs each webhook body with the app secret: `X-Hub-Signature-256: sha256=<hex>`. */
export async function verifySignature(
  appSecret: string,
  rawBody: string,
  header: string | null,
): Promise<boolean> {
  if (!header?.startsWith('sha256=')) return false;
  return timingSafeEqual(header.slice(7), await hmacSha256Hex(appSecret, rawBody));
}

/** Delivery receipts in a webhook payload. Anything unexpected is ignored. */
export function statusUpdates(payload: unknown): Array<{ id: string; status: string }> {
  const out: Array<{ id: string; status: string }> = [];
  const entries = (payload as { entry?: unknown } | null)?.entry;
  if (!Array.isArray(entries)) return out;
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown } | null)?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const statuses = (change as { value?: { statuses?: unknown } } | null)?.value?.statuses;
      if (!Array.isArray(statuses)) continue;
      for (const s of statuses) {
        const { id, status } = (s ?? {}) as { id?: unknown; status?: unknown };
        if (typeof id === 'string' && typeof status === 'string' && /^[a-z]{1,20}$/.test(status)) {
          out.push({ id: id.slice(0, 200), status });
        }
      }
    }
  }
  return out;
}
