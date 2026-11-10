import { sanitizeText } from '@twindesk/core';
import type { Config } from './config';
import { hmacSha256Hex, timingSafeEqual } from './crypto';

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

/** The approved utility template: "Reminder: {{1}} starts at {{2}}. Sent by Desk Twin." */
export function reminderMessage(config: Config, title: string, time: string) {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: config.WHATSAPP_TO,
    type: 'template',
    template: {
      name: config.WHATSAPP_TEMPLATE,
      language: { code: config.WHATSAPP_TEMPLATE_LANGUAGE },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: templateText(title) },
            { type: 'text', text: time },
          ],
        },
      ],
    },
  };
}

/** Sends through the WhatsApp Cloud API and returns Meta's message id. */
export async function sendWhatsApp(
  config: Config,
  message: ReturnType<typeof reminderMessage>,
  fetchFn: typeof fetch,
): Promise<string> {
  const url = `https://graph.facebook.com/${config.GRAPH_API_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const response = await fetchFn(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.WHATSAPP_TOKEN}`,
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
