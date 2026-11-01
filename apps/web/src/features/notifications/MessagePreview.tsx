import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatTime, safeUrl, type DeliveryChannel, type RenderedMessage } from '@twindesk/core';
import { useTenant } from '@/features/tenant/tenant-context';
import { useLocale } from '@/shared/hooks/use-locale';
import { cn } from '@/lib/cn';

/**
 * How one rendered message looks on its channel. Frames are generic on purpose: they show the
 * wording and layout, never a third party's branding. Text is always rendered as text.
 */
export function MessagePreview({
  message,
  to,
  className,
}: {
  message: RenderedMessage;
  /** Masked destination, shown where the channel has one. */
  to?: string;
  className?: string;
}) {
  const { tenant } = useTenant();
  const locale = useLocale();
  const time = formatTime(new Date(), locale);
  const productName = tenant.productName;
  const senderDomain = tenant.legal.supportEmail.split('@')[1] ?? 'example.com';

  switch (message.channel) {
    case 'push':
      return (
        <PhoneFrame className={className} caption={`Phone push · ${time}`}>
          <div className="rounded-2xl border border-line bg-surface/95 p-3 shadow-sm">
            <div className="flex items-center gap-2 text-[11px] text-fg-subtle">
              <AppMark />
              <span className="font-medium tracking-wide text-fg-muted uppercase">
                {message.footer}
              </span>
              <span className="ml-auto">now</span>
            </div>
            <p className="mt-2 text-[13px] font-semibold text-fg">{message.title}</p>
            <p className="mt-0.5 text-[13px] leading-snug text-fg-muted">{message.body}</p>
          </div>
        </PhoneFrame>
      );
    case 'whatsapp':
    case 'sms':
      return (
        <PhoneFrame className={className} caption={`${channelName(message.channel)} · ${time}`}>
          <div className="flex items-center gap-2 border-b border-line pb-2">
            <AppMark />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-fg">{productName}</p>
              <p className="truncate text-[11px] text-fg-subtle">
                {message.channel === 'whatsapp'
                  ? 'Business account · notifications only'
                  : 'Sender ID'}
              </p>
            </div>
          </div>
          <div className="mt-3 max-w-[92%] rounded-2xl rounded-tl-md border border-line bg-surface p-3">
            {message.title ? (
              <p className="text-[13px] font-semibold text-fg">{message.title}</p>
            ) : null}
            <p className="text-[13px] leading-snug whitespace-pre-line text-fg">{message.body}</p>
            <p className="mt-2 text-[11px] leading-snug text-fg-subtle">{message.footer}</p>
            <p className="mt-1 text-right font-mono text-[10px] text-fg-subtle">{time}</p>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-2 text-[11px] text-fg-subtle">
            <Lock className="size-3.5" aria-hidden />
            Replies are not read or acted on
          </div>
        </PhoneFrame>
      );
    case 'email':
      return (
        <Frame className={className} caption="Email">
          <dl className="space-y-1 border-b border-line pb-3 text-[12px]">
            <HeaderRow label="From" value={`${productName} <notifications@${senderDomain}>`} />
            {to ? <HeaderRow label="To" value={to} /> : null}
            <HeaderRow label="Subject" value={message.subject ?? message.title} strong />
          </dl>
          <p className="mt-3 text-[14px] font-semibold text-fg">{message.title}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{message.body}</p>
          <p className="mt-4 border-t border-line pt-3 text-[11px] leading-snug text-fg-subtle">
            {message.footer}
          </p>
        </Frame>
      );
    case 'teams':
      return (
        <Frame className={className} caption="Microsoft Teams · chat message from the app">
          <div className="flex items-center gap-2 text-[12px]">
            <AppMark />
            <span className="font-semibold text-fg">{productName}</span>
            <span className="rounded border border-line px-1 text-[10px] text-fg-subtle">App</span>
            <span className="ml-auto font-mono text-[10px] text-fg-subtle">{time}</span>
          </div>
          <div className="mt-3 rounded-lg border border-l-4 border-line border-l-brand bg-surface p-3">
            <p className="text-[13px] font-semibold text-fg">{message.title}</p>
            <p className="mt-1 text-[13px] leading-snug text-fg-muted">{message.body}</p>
            <p className="mt-2 text-[11px] text-fg-subtle">{message.footer}</p>
          </div>
        </Frame>
      );
    case 'in-app':
      return (
        <Frame className={className} caption="In the app · notifications menu">
          <div className="flex gap-3">
            <AppMark />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-fg">{message.title}</p>
              <p className="mt-0.5 text-[13px] leading-snug text-fg-muted">{message.body}</p>
              <p className="mt-1 font-mono text-[11px] text-fg-subtle">{message.footer}</p>
            </div>
          </div>
        </Frame>
      );
  }
}

function channelName(channel: DeliveryChannel) {
  return channel === 'whatsapp' ? 'WhatsApp' : 'Text message';
}

function Frame({
  caption,
  className,
  children,
}: {
  caption: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <figure className={cn('rounded-xl border border-line bg-surface-2 p-4', className)}>
      <div className="rounded-lg border border-line bg-bg p-4">{children}</div>
      <figcaption className="mt-2 text-[11px] text-fg-subtle">{caption}</figcaption>
    </figure>
  );
}

function PhoneFrame({
  caption,
  className,
  children,
}: {
  caption: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <figure className={cn('mx-auto w-full max-w-[320px]', className)}>
      <div className="rounded-[28px] border border-line-strong bg-surface-2 p-2.5 shadow-lg">
        <div className="min-h-64 rounded-[22px] bg-bg px-3 pt-3 pb-4">
          <div aria-hidden className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-surface-3" />
          {children}
        </div>
      </div>
      <figcaption className="mt-2 text-center text-[11px] text-fg-subtle">{caption}</figcaption>
    </figure>
  );
}

function HeaderRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="w-14 shrink-0 text-fg-subtle">{label}</dt>
      <dd className={cn('min-w-0 break-words', strong ? 'font-semibold text-fg' : 'text-fg-muted')}>
        {value}
      </dd>
    </div>
  );
}

/** The tenant's square mark, or its initial, as the sender's picture. */
function AppMark() {
  const { tenant } = useTenant();
  const mark = safeUrl(tenant.brand.markUrl);
  return mark ? (
    <img src={mark} alt="" width={20} height={20} className="size-5 shrink-0 object-contain" />
  ) : (
    <span
      aria-hidden
      className="grid size-5 shrink-0 place-items-center rounded-md brand-gradient text-[10px] font-bold text-on-brand"
    >
      {tenant.brand.wordmark.charAt(0)}
    </span>
  );
}
