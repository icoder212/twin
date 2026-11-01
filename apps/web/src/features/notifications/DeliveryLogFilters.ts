import type { NotificationEvent, Urgency } from '@twindesk/core';

export type UrgencyFilter = 'all' | Urgency;
export type StatusFilter = 'all' | 'needs-ack' | 'escalated';

export interface LogFilters {
  urgency: UrgencyFilter;
  status: StatusFilter;
  search: string;
}

export const NO_FILTERS: LogFilters = { urgency: 'all', status: 'all', search: '' };

/** Important and critical notifications wait for the user to say they have seen them. */
export function needsAcknowledgement(event: NotificationEvent): boolean {
  return event.urgency !== 'info' && !event.acknowledgedAt;
}

export function filterEvents(events: NotificationEvent[], f: LogFilters): NotificationEvent[] {
  const search = f.search.trim().toLowerCase();
  return events.filter((e) => {
    if (f.urgency !== 'all' && e.urgency !== f.urgency) return false;
    if (f.status === 'needs-ack' && !needsAcknowledgement(e)) return false;
    if (f.status === 'escalated' && e.escalation?.status !== 'sent') return false;
    if (search && !`${e.title} ${e.ref}`.toLowerCase().includes(search)) return false;
    return true;
  });
}

export function summarise(events: NotificationEvent[]) {
  const deliveries = events.flatMap((e) => e.deliveries);
  return {
    sent: deliveries.filter((d) => d.status === 'delivered' || d.status === 'read').length,
    held: deliveries.filter((d) => d.status === 'held').length,
    waiting: events.filter(needsAcknowledgement).length,
    escalated: events.filter((e) => e.escalation?.status === 'sent').length,
  };
}
