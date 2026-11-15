import type { Config } from './config';

export class EmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailError';
  }
}

/** Sends an email through Resend, plain text with an optional HTML version, and returns its id. */
export async function sendEmail(
  config: Config,
  message: { to: string; subject: string; text: string; html?: string },
  fetchFn: typeof fetch,
): Promise<string> {
  if (!config.RESEND_API_KEY) throw new EmailError('Email is not set up yet');
  const response = await fetchFn('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.RESEND_FROM,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    }),
  });
  const data = (await response.json().catch(() => null)) as {
    id?: unknown;
    message?: unknown;
  } | null;
  if (!response.ok) {
    const detail = typeof data?.message === 'string' ? data.message.slice(0, 160) : '';
    throw new EmailError(`Email was refused (${response.status}) ${detail}`.trim());
  }
  if (typeof data?.id !== 'string') throw new EmailError('Email service sent no message id');
  return data.id;
}
