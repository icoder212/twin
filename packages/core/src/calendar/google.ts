import { z } from 'zod';
import type { CalendarEvent } from '../domain/calendar';
import { sanitizeText } from '../security/sanitize';
import { safeUrl } from '../security/url';

/** Read-only access to calendar events, and nothing else in the account. */
export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

// Only the fields the desk uses. Descriptions and attendees' names and addresses are never
// requested, so they never reach the browser, the prompt or the logs.
const FIELDS =
  'summary,items(id,status,summary,location,htmlLink,hangoutLink,eventType,start,end,' +
  'attendees(self,resource,responseStatus),conferenceData/entryPoints(entryPointType,uri))';

const whenSchema = z.object({ dateTime: z.string().optional(), date: z.string().optional() });

const googleEventSchema = z.object({
  id: z.string(),
  status: z.string().optional(),
  summary: z.string().optional(),
  location: z.string().optional(),
  htmlLink: z.string().optional(),
  hangoutLink: z.string().optional(),
  eventType: z.string().optional(),
  start: whenSchema,
  end: whenSchema,
  attendees: z
    .array(
      z.object({
        self: z.boolean().optional(),
        resource: z.boolean().optional(),
        responseStatus: z.string().optional(),
      }),
    )
    .optional(),
  conferenceData: z
    .object({
      entryPoints: z
        .array(z.object({ entryPointType: z.string().optional(), uri: z.string().optional() }))
        .optional(),
    })
    .optional(),
});

const googleListSchema = z.object({
  summary: z.string().optional(),
  items: z.array(z.unknown()).optional(),
});

const EVENT_ID = /^[A-Za-z0-9_-]{1,1024}$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_URL = 2048;

function instant(value: z.infer<typeof whenSchema>): { iso: string; allDay: boolean } | null {
  if (value.dateTime) {
    const t = Date.parse(value.dateTime);
    return Number.isNaN(t) ? null : { iso: new Date(t).toISOString(), allDay: false };
  }
  if (value.date && DATE_ONLY.test(value.date)) {
    return { iso: `${value.date}T12:00:00.000Z`, allDay: true };
  }
  return null;
}

function link(value: string | undefined, allowedHosts?: string[]): string | undefined {
  const url = safeUrl(value, { allowRelative: false, allowedHosts });
  return url && url.length <= MAX_URL ? url : undefined;
}

/** Maps one Google event onto the desk's shape, or null for events the desk leaves out. */
export function fromGoogleEvent(raw: unknown): CalendarEvent | null {
  const parsed = googleEventSchema.safeParse(raw);
  if (!parsed.success) return null;
  const e = parsed.data;
  if (!EVENT_ID.test(e.id) || e.status === 'cancelled' || e.eventType === 'workingLocation') {
    return null;
  }
  const self = e.attendees?.find((a) => a.self);
  if (self?.responseStatus === 'declined') return null;
  const start = instant(e.start);
  const end = instant(e.end);
  if (!start || !end) return null;

  const title = sanitizeText(e.summary ?? '', { maxLength: 200, multiline: false });
  const location = sanitizeText(e.location ?? '', { maxLength: 200, multiline: false });
  const video = e.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri;
  return {
    id: e.id,
    title: title || 'Untitled event',
    start: start.iso,
    end: end.iso,
    allDay: start.allDay,
    location: location || undefined,
    joinUrl: link(e.hangoutLink ?? video),
    link: link(e.htmlLink, ['google.com']),
    tentative: e.status === 'tentative' || self?.responseStatus === 'tentative',
    guests: e.attendees?.filter((a) => !a.self && !a.resource).length ?? 0,
  };
}

/** `expired`: Google refused the access token, so the user has to connect again. */
export class GoogleCalendarError extends Error {
  readonly reason: 'expired' | 'failed';

  constructor(reason: 'expired' | 'failed', message: string) {
    super(message);
    this.name = 'GoogleCalendarError';
    this.reason = reason;
  }
}

export interface ListGoogleEventsOptions {
  accessToken: string;
  from: Date;
  to: Date;
  /** Defaults to the global fetch; injected in tests. */
  fetch?: typeof fetch;
  signal?: AbortSignal;
}

/** Events on the user's primary calendar between two instants, soonest first. */
export async function listGoogleEvents(
  options: ListGoogleEventsOptions,
): Promise<{ calendarName?: string; events: CalendarEvent[] }> {
  const url = new URL(EVENTS_URL);
  url.search = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
    timeMin: options.from.toISOString(),
    timeMax: options.to.toISOString(),
    fields: FIELDS,
  }).toString();

  const doFetch = options.fetch ?? globalThis.fetch;
  let response: Response;
  try {
    response = await doFetch(url.toString(), {
      headers: { Authorization: `Bearer ${options.accessToken}` },
      signal: options.signal,
    });
  } catch {
    throw new GoogleCalendarError(
      'failed',
      'Could not reach Google Calendar. Check your connection and try again.',
    );
  }
  if (response.status === 401) {
    throw new GoogleCalendarError(
      'expired',
      'Access to Google Calendar has ended. Connect again to see your events.',
    );
  }
  if (response.status === 403) {
    throw new GoogleCalendarError(
      'failed',
      'Google refused access to the calendar. Check that the Google Calendar API is turned on for this app and that calendar access was allowed.',
    );
  }
  if (!response.ok) {
    throw new GoogleCalendarError('failed', 'Google Calendar did not respond. Try again shortly.');
  }

  const body = googleListSchema.safeParse(await response.json().catch(() => null));
  if (!body.success) {
    throw new GoogleCalendarError(
      'failed',
      'Google Calendar sent a response that could not be read.',
    );
  }
  const events = (body.data.items ?? [])
    .map(fromGoogleEvent)
    .filter((e): e is CalendarEvent => e !== null);
  const calendarName = sanitizeText(body.data.summary ?? '', { maxLength: 200, multiline: false });
  return { calendarName: calendarName || undefined, events };
}
