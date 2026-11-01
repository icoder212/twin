import {
  TOPIC_LABELS,
  URGENCY_LABELS,
  type ContactChannel,
  type DeliveryChannel,
  type MessagePrivacy,
  type NotificationEvent,
} from '../domain/notifications';

export type RenderableEvent = Pick<
  NotificationEvent,
  'ref' | 'topic' | 'urgency' | 'title' | 'body'
>;

export interface RenderContext {
  productName: string;
  privacy: MessagePrivacy;
}

export interface RenderedMessage {
  channel: DeliveryChannel;
  /** Email subject line. */
  subject?: string;
  title: string;
  body: string;
  footer: string;
}

const SMS_LIMIT = 160;

/**
 * The exact wording of one notification on one channel. Minimal privacy keeps figures, names
 * and account details inside the app: outside it, the message only says that something is
 * waiting. Messages outside the app never contain links that sign anyone in.
 */
export function renderMessage(
  event: RenderableEvent,
  channel: DeliveryChannel,
  ctx: RenderContext,
): RenderedMessage {
  const { productName } = ctx;
  const minimal = ctx.privacy === 'minimal' && channel !== 'in-app';
  const urgency = URGENCY_LABELS[event.urgency].label;
  const title = minimal ? TOPIC_LABELS[event.topic] : event.title;
  const body = minimal
    ? `You have a new ${urgency.toLowerCase()} notification. Open ${productName} to see the details.`
    : event.body;

  switch (channel) {
    case 'in-app':
      return { channel, title: event.title, body: event.body, footer: `Ref ${event.ref}` };
    case 'push':
      return {
        channel,
        title,
        body: minimal ? `Open ${productName} to see it.` : event.body,
        footer: productName,
      };
    case 'email':
      return {
        channel,
        subject: `[${productName}] ${urgency}: ${title}`,
        title,
        body,
        footer: `Reference ${event.ref}. Sign in to ${productName} as usual to see the details. We never ask for your password or a code by email.`,
      };
    case 'whatsapp':
      return {
        channel,
        title: `${productName} · ${urgency}`,
        body: `${title}\n${body}`,
        footer: `Ref ${event.ref}. This number sends notifications only and cannot take instructions. Reply STOP to turn them off.`,
      };
    case 'teams':
      return {
        channel,
        title,
        body,
        footer: `Ref ${event.ref} · Acknowledge in ${productName}`,
      };
    case 'sms': {
      const footer = `Ref ${event.ref}. STOP to opt out`;
      const text = `${productName}: ${title}. ${minimal ? 'Open the app for details.' : body}`;
      const room = SMS_LIMIT - footer.length - 1;
      return {
        channel,
        title: '',
        body: text.length > room ? `${text.slice(0, room - 3).trimEnd()}...` : text,
        footer,
      };
    }
  }
}

/** Masks an address for display, keeping enough to recognise it. */
export function maskAddress(channel: ContactChannel, address: string): string {
  if (channel === 'email' || channel === 'teams') {
    const [local = '', domain = ''] = address.split('@');
    return `${local.slice(0, 1)}•••@${domain}`;
  }
  const digits = address.replace(/\D/g, '');
  const country = address.startsWith('+44') ? '+44' : `+${digits.slice(0, 2)}`;
  return `${country} ••• ••${digits.slice(-4)}`;
}
