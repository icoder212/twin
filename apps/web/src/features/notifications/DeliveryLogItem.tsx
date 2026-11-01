import { CheckCircle2, ChevronDown, Repeat, Timer } from 'lucide-react';
import { useId, useState } from 'react';
import {
  CHANNEL_LABELS,
  URGENCY_LABELS,
  formatDateTime,
  formatRelative,
  formatTime,
  type DeliveryChannel,
  type MessagePrivacy,
  type NotificationEvent,
} from '@twindesk/core';
import { cn } from '@/lib/cn';
import { useLocale } from '@/shared/hooks/use-locale';
import { Badge, toneClasses, toneText } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { needsAcknowledgement } from './DeliveryLogFilters';
import { EventDetail } from './EventDetail';
import { CHANNEL_ICONS, DELIVERY_STATUS_META, URGENCY_META } from './notify-meta';
import { useAcknowledge } from './queries';

const VIA: Record<DeliveryChannel, string> = {
  'in-app': 'the app',
  push: 'phone push',
  email: 'email',
  whatsapp: 'WhatsApp',
  teams: 'Microsoft Teams',
  sms: 'text message',
};

export function DeliveryLogItem({
  event,
  privacy,
}: {
  event: NotificationEvent;
  privacy: MessagePrivacy;
}) {
  const locale = useLocale();
  const acknowledge = useAcknowledge();
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const urgency = URGENCY_META[event.urgency];
  const UrgencyIcon = urgency.icon;
  const firstSend = event.deliveries.filter((d) => !d.escalation);

  const status = (
    <>
      {event.escalation?.status === 'waiting' ? (
        <p className={cn('flex items-start gap-1.5', toneText.warning)}>
          <Timer className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            Escalates at {formatTime(event.escalation.dueAt, locale)} if not acknowledged ·{' '}
            {event.escalation.target}
          </span>
        </p>
      ) : event.escalation?.status === 'sent' ? (
        <p className={cn('flex items-start gap-1.5', toneText.danger)}>
          <Repeat className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            Escalated at {formatTime(event.escalation.dueAt, locale)} · {event.escalation.target}
          </span>
        </p>
      ) : event.escalation?.status === 'cancelled' ? (
        <p className="flex items-center gap-1.5 text-fg-subtle">
          <Repeat className="size-3.5 shrink-0" aria-hidden />
          Escalation stopped
        </p>
      ) : null}
      {event.acknowledgedAt ? (
        <p className={cn('flex items-center gap-1.5', toneText.success)}>
          <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
          Acknowledged {formatTime(event.acknowledgedAt, locale)}
          {event.acknowledgedVia ? ` via ${VIA[event.acknowledgedVia]}` : ''}
        </p>
      ) : null}
    </>
  );

  return (
    <li className="min-w-0">
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:gap-4 sm:px-5">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            className={cn(
              'mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border',
              toneClasses[urgency.tone],
            )}
          >
            <UrgencyIcon className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Badge tone={urgency.tone}>{URGENCY_LABELS[event.urgency].label}</Badge>
              <p className="min-w-0 text-[14px] font-semibold break-words text-fg">{event.title}</p>
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{event.body}</p>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-fg-subtle">
              <time dateTime={event.createdAt} title={formatDateTime(event.createdAt, locale)}>
                {formatRelative(event.createdAt, locale)}
              </time>
              <span aria-hidden>·</span>
              <code className="font-mono">{event.ref}</code>
            </p>
            <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Channels">
              {firstSend.map((d, i) => {
                const Icon = CHANNEL_ICONS[d.channel];
                const meta = DELIVERY_STATUS_META[d.status];
                return (
                  <li
                    key={i}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2/60 py-0.5 pr-1 pl-2 text-[11.5px] text-fg-muted"
                  >
                    <Icon className="size-3.5 text-fg-subtle" aria-hidden />
                    {CHANNEL_LABELS[d.channel]}
                    <Badge tone={meta.tone} className="py-0">
                      {meta.label}
                    </Badge>
                  </li>
                );
              })}
            </ul>
            {event.escalation || event.acknowledgedAt ? (
              <div className="mt-2.5 space-y-1 text-[12.5px]">{status}</div>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 pl-11 sm:pl-0">
          {needsAcknowledgement(event) ? (
            <Button
              variant="primary"
              size="sm"
              loading={acknowledge.isPending}
              onClick={() => acknowledge.mutate(event.id)}
              aria-label={`Acknowledge “${event.title}”`}
            >
              <CheckCircle2 aria-hidden />
              Acknowledge
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={open}
            aria-controls={open ? detailId : undefined}
            aria-label={`${open ? 'Hide details' : 'Details'} for “${event.title}”`}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Hide details' : 'Details'}
            <ChevronDown className={cn('transition-transform', open && 'rotate-180')} aria-hidden />
          </Button>
        </div>
      </div>
      {open ? <EventDetail id={detailId} event={event} privacy={privacy} /> : null}
    </li>
  );
}
