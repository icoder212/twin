import { CalendarDays, Video } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import {
  dayKeyIn,
  formatRelative,
  formatShortDate,
  formatTime,
  safeUrl,
  type CalendarEvent,
  type CalendarUpcoming,
  type FormatLocale,
} from '@twindesk/core';
import { env } from '@/app/env';
import { useTenant } from '@/features/tenant/tenant-context';
import { toastError } from '@/lib/mutation';
import { QueryView } from '@/shared/components/QueryView';
import { useLocale } from '@/shared/hooks/use-locale';
import { Badge } from '@/shared/ui/badge';
import { Button, buttonVariants } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/feedback';
import { connectGoogleCalendar } from './google-access';
import { useCalendar, useConnectGoogleCalendar } from './queries';

const MAX_SHOWN = 8;
const CALENDAR_QUESTION = 'What’s on my calendar today?';

/** The user's own calendar for the next 7 days, next to their trading day. */
export function CalendarCard() {
  const calendar = useCalendar(7);
  const locale = useLocale();
  const navigate = useNavigate();
  const { isEnabled } = useTenant();
  const connected = calendar.data?.connection === 'connected';

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="size-4 text-brand-fg" aria-hidden /> Your calendar
          </CardTitle>
          <CardDescription>
            {connected
              ? 'Next 7 days, read-only. A reminder appears in the app 10 minutes before each event.'
              : 'Your meetings alongside your trading day, read-only.'}
          </CardDescription>
        </div>
        {connected && isEnabled('twin') ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void navigate('/twin', { state: { prompt: CALENDAR_QUESTION, autoSend: true } })
            }
          >
            Ask the twin
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        <QueryView query={calendar} loading={<Skeleton className="h-32 rounded-xl" />}>
          {(data) =>
            data.connection === 'connected' ? (
              <EventList data={data} locale={locale} />
            ) : (
              <ConnectPrompt expired={data.connection === 'expired'} />
            )
          }
        </QueryView>
      </CardContent>
    </Card>
  );
}

function ConnectPrompt({ expired }: { expired: boolean }) {
  const connect = useConnectGoogleCalendar();
  const clientId = env.googleClientId;
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-[13px] leading-relaxed text-fg-muted">
        {expired
          ? 'Access to Google Calendar has ended. Connect again to see your meetings.'
          : 'Connect Google Calendar to see your meetings here, with a reminder in the app 10 minutes before each one.'}
      </p>
      {clientId ? (
        <>
          <Button
            variant="primary"
            size="sm"
            loading={connect.isPending}
            onClick={() =>
              connect.mutate(connectGoogleCalendar(clientId), {
                onError: toastError('Could not connect Google Calendar'),
              })
            }
          >
            {expired ? 'Connect again' : 'Connect Google Calendar'}
          </Button>
          <p className="text-[11.5px] text-fg-subtle">
            In the demo, access stays in this browser tab for up to an hour and is never stored.
          </p>
        </>
      ) : (
        <Link to="/sources" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Connect in Sources
        </Link>
      )}
    </div>
  );
}

function EventList({ data, locale }: { data: CalendarUpcoming; locale: FormatLocale }) {
  // Everything is relative to when the calendar was read, so the list renders the same each time.
  const reference = data.fetchedAt ?? data.events[0]?.start ?? '1970-01-01T00:00:00Z';
  if (!data.events.length) {
    return (
      <p className="text-[13px] text-fg-muted">Nothing is on your calendar for the next 7 days.</p>
    );
  }
  const today = dayKeyIn(locale.timezone, reference);
  const tomorrow = dayKeyIn(locale.timezone, reference, 1);
  const groups = new Map<string, CalendarEvent[]>();
  for (const e of data.events.slice(0, MAX_SHOWN)) {
    const key = dayKeyIn(locale.timezone, e.start);
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const hidden = data.events.length - MAX_SHOWN;

  return (
    <div className="flex flex-col gap-4">
      {[...groups].map(([key, events]) => (
        <div key={key}>
          <h3 className="text-[11px] font-medium tracking-[0.08em] text-fg-subtle uppercase">
            {key === today
              ? 'Today'
              : key === tomorrow
                ? 'Tomorrow'
                : formatShortDate(events[0]?.start ?? reference, locale)}
          </h3>
          <ul className="mt-1 flex flex-col divide-y divide-line">
            {events.map((e) => (
              <EventRow
                key={`${e.id}-${e.start}`}
                event={e}
                locale={locale}
                reference={reference}
              />
            ))}
          </ul>
        </div>
      ))}
      {hidden > 0 ? (
        <p className="text-[12px] text-fg-subtle">and {hidden} more in the next 7 days</p>
      ) : null}
      <p className="border-t border-line pt-3 text-[11.5px] text-fg-subtle">
        {data.calendarName ?? 'Google Calendar'}
        {data.fetchedAt
          ? ` · updated ${formatRelative(data.fetchedAt, locale, Date.parse(reference))}`
          : ''}
        {data.accessEndsAt ? ` · access ends at ${formatTime(data.accessEndsAt, locale)}` : ''}
      </p>
    </div>
  );
}

function EventRow({
  event: e,
  locale,
  reference,
}: {
  event: CalendarEvent;
  locale: FormatLocale;
  reference: string;
}) {
  const join = safeUrl(e.joinUrl, { allowRelative: false });
  const underWay = !e.allDay && Date.parse(e.start) <= Date.parse(reference);
  return (
    <li className="flex items-start gap-3 py-2.5 last:pb-0">
      <span className="w-[6.5rem] shrink-0 pt-px font-mono text-[12px] text-fg tabular">
        {e.allDay ? 'All day' : `${formatTime(e.start, locale)} to ${formatTime(e.end, locale)}`}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] text-fg">{e.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[11.5px] text-fg-subtle">
          {underWay ? <Badge tone="info">Under way</Badge> : null}
          {e.tentative ? <Badge tone="warning">Maybe</Badge> : null}
          {e.location ? <span className="min-w-0 truncate">{e.location}</span> : null}
          {e.guests ? <span>{e.guests === 1 ? '1 guest' : `${e.guests} guests`}</span> : null}
        </span>
      </span>
      {join ? (
        <a
          href={join}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          <Video aria-hidden /> Join
        </a>
      ) : null}
    </li>
  );
}
