import { ArrowUpRight, Repeat } from 'lucide-react';
import { Link } from 'react-router';
import {
  CHANNEL_LABELS,
  formatDateTime,
  renderMessage,
  type MessagePrivacy,
  type NotificationEvent,
} from '@twindesk/core';
import { useTenant } from '@/features/tenant/tenant-context';
import { useLocale } from '@/shared/hooks/use-locale';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { CHANNEL_ICONS, DELIVERY_STATUS_META } from './notify-meta';

const PRIVACY_LABELS: Record<MessagePrivacy, string> = {
  minimal: 'minimal wording',
  standard: 'standard wording',
};

/** Same-app paths only; anything else is not offered as a link. */
function appPath(href: string | undefined): string | null {
  return href && href.startsWith('/') && !href.startsWith('//') ? href : null;
}

/** Every delivery of one notification, and how the message read on each channel. */
export function EventDetail({
  event,
  privacy,
  id,
}: {
  event: NotificationEvent;
  privacy: MessagePrivacy;
  id: string;
}) {
  const locale = useLocale();
  const { tenant } = useTenant();
  const href = appPath(event.href);
  const shown = [
    ...new Set(
      event.deliveries.filter((d) => !d.escalation && d.status !== 'skipped').map((d) => d.channel),
    ),
  ];

  return (
    <div id={id} className="space-y-4 border-t border-line bg-surface-2/30 px-4 py-4 sm:px-5">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[12px] font-semibold tracking-wide text-fg">Deliveries</h3>
          {href ? (
            <Button asChild variant="link" size="sm" className="text-[13px]">
              <Link to={href}>
                Open
                <ArrowUpRight aria-hidden />
              </Link>
            </Button>
          ) : null}
        </div>
        <table className="mt-2 hidden w-full border-collapse text-left text-[12.5px] sm:table">
          <caption className="sr-only">Deliveries for {event.ref}</caption>
          <thead>
            <tr className="border-b border-line text-[11px] tracking-[0.12em] text-fg-subtle uppercase">
              <th scope="col" className="py-2 pr-3 font-mono font-medium">
                Channel
              </th>
              <th scope="col" className="py-2 pr-3 font-mono font-medium">
                To
              </th>
              <th scope="col" className="py-2 pr-3 font-mono font-medium">
                Status
              </th>
              <th scope="col" className="py-2 pr-3 font-mono font-medium">
                Time
              </th>
              <th scope="col" className="py-2 font-mono font-medium">
                Note
              </th>
            </tr>
          </thead>
          <tbody>
            {event.deliveries.map((d, i) => {
              const Icon = CHANNEL_ICONS[d.channel];
              const status = DELIVERY_STATUS_META[d.status];
              return (
                <tr key={i} className="border-b border-line/60 align-top last:border-0">
                  <td className="py-2 pr-3 whitespace-nowrap text-fg">
                    <span className="inline-flex items-center gap-1.5">
                      <Icon className="size-3.5 text-fg-subtle" aria-hidden />
                      {CHANNEL_LABELS[d.channel]}
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-mono text-[12px] break-all text-fg-muted">
                    {d.to ?? '—'}
                  </td>
                  <td className="py-2 pr-3">
                    <span className="inline-flex flex-wrap items-center gap-1">
                      <Badge tone={status.tone}>{status.label}</Badge>
                      {d.escalation ? (
                        <Badge tone="danger">
                          <Repeat aria-hidden />
                          Escalation
                        </Badge>
                      ) : null}
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-mono text-[12px] whitespace-nowrap text-fg-muted tabular">
                    <time dateTime={d.at}>{formatDateTime(d.at, locale)}</time>
                  </td>
                  <td className="py-2 text-fg-muted">{d.note ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <ul className="mt-2 divide-y divide-line/60 sm:hidden">
          {event.deliveries.map((d, i) => {
            const Icon = CHANNEL_ICONS[d.channel];
            const status = DELIVERY_STATUS_META[d.status];
            return (
              <li key={i} className="flex flex-col gap-1 py-2 text-[12.5px]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Icon className="size-3.5 text-fg-subtle" aria-hidden />
                  <span className="font-medium text-fg">{CHANNEL_LABELS[d.channel]}</span>
                  <Badge tone={status.tone}>{status.label}</Badge>
                  {d.escalation ? (
                    <Badge tone="danger">
                      <Repeat aria-hidden />
                      Escalation
                    </Badge>
                  ) : null}
                </div>
                <p className="text-fg-muted">
                  {[d.to, formatDateTime(d.at, locale), d.note].filter(Boolean).join(' · ')}
                </p>
              </li>
            );
          })}
        </ul>
      </div>

      {shown.length > 0 ? (
        <div>
          <h3 className="text-[12px] font-semibold tracking-wide text-fg">How it read</h3>
          <p className="mt-0.5 text-xs text-fg-subtle">
            With your current setting, {PRIVACY_LABELS[privacy]} outside the app.
          </p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {shown.map((channel) => {
              const m = renderMessage(event, channel, { productName: tenant.productName, privacy });
              const Icon = CHANNEL_ICONS[channel];
              return (
                <li key={channel} className="min-w-0 rounded-lg border border-line bg-surface p-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-medium text-fg-subtle">
                    <Icon className="size-3.5" aria-hidden />
                    {CHANNEL_LABELS[channel]}
                  </p>
                  {m.subject ? (
                    <p className="mt-1.5 text-[12px] break-words text-fg-muted">
                      Subject: {m.subject}
                    </p>
                  ) : null}
                  {m.title ? (
                    <p className="mt-1.5 text-[13px] font-semibold break-words text-fg">
                      {m.title}
                    </p>
                  ) : null}
                  <p className="mt-1 text-[13px] leading-relaxed break-words whitespace-pre-line text-fg-muted">
                    {m.body}
                  </p>
                  {m.footer ? (
                    <p className="mt-1.5 text-[11.5px] break-words text-fg-subtle">{m.footer}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
