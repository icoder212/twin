import {
  CheckCheck,
  Hourglass,
  History,
  Repeat,
  Search,
  Send,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { URGENCIES, URGENCY_LABELS } from '@twindesk/core';
import { QueryView } from '@/shared/components/QueryView';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { EmptyState, Skeleton } from '@/shared/ui/feedback';
import { Input, Select } from '@/shared/ui/field';
import {
  NO_FILTERS,
  filterEvents,
  summarise,
  type LogFilters,
  type StatusFilter,
  type UrgencyFilter,
} from './DeliveryLogFilters';
import { DeliveryLogItem } from './DeliveryLogItem';
import { useNotificationEvents, useNotificationPreferences } from './queries';

function Stat({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: number;
  hint: string;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12.5px] font-medium text-fg-muted">{label}</p>
        <Icon className="size-4 text-fg-subtle" aria-hidden />
      </div>
      <p className="mt-2 text-[26px] leading-none font-semibold tracking-tight text-fg tabular">
        {value}
      </p>
      <p className="mt-1.5 text-xs text-fg-subtle">{hint}</p>
    </div>
  );
}

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: 'Any status',
  'needs-ack': 'Needs acknowledgement',
  escalated: 'Escalated',
};

export function DeliveryLogTab() {
  const events = useNotificationEvents();
  const preferences = useNotificationPreferences();
  const [filters, setFilters] = useState<LogFilters>(NO_FILTERS);
  const privacy = preferences.data?.privacy ?? 'minimal';
  const filtered = useMemo(
    () => (events.data ? filterEvents(events.data, filters) : []),
    [events.data, filters],
  );
  const filtering =
    filters.urgency !== 'all' || filters.status !== 'all' || filters.search.trim() !== '';

  return (
    <QueryView
      query={events}
      loading={
        <div className="space-y-5" aria-busy="true">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      }
    >
      {(all) => {
        const stats = summarise(all);
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat
                label="Sent"
                value={stats.sent}
                hint={`Messages across ${all.length} notifications`}
                icon={Send}
              />
              <Stat
                label="Held or bundled"
                value={stats.held}
                hint="Quiet hours or your daily summary"
                icon={Hourglass}
              />
              <Stat
                label="Waiting for you"
                value={stats.waiting}
                hint="Important or critical, not yet acknowledged"
                icon={CheckCheck}
              />
              <Stat
                label="Escalated"
                value={stats.escalated}
                hint="Repeated or sent to a supervisor"
                icon={Repeat}
              />
            </div>

            <Card className="overflow-hidden">
              <div className="flex flex-col gap-3 border-b border-line p-4 sm:px-5 md:flex-row md:items-center">
                <div className="relative flex-1">
                  <label htmlFor="log-search" className="sr-only">
                    Search the delivery log
                  </label>
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle"
                    aria-hidden
                  />
                  <Input
                    id="log-search"
                    type="search"
                    value={filters.search}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, search: e.target.value.slice(0, 100) }))
                    }
                    maxLength={100}
                    placeholder="Search titles or references such as NT-7Q2M4K"
                    className="pl-9"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 md:flex">
                  <div className="md:w-44">
                    <label htmlFor="log-urgency" className="sr-only">
                      Urgency
                    </label>
                    <Select
                      id="log-urgency"
                      value={filters.urgency}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, urgency: e.target.value as UrgencyFilter }))
                      }
                    >
                      <option value="all">Any urgency</option>
                      {URGENCIES.map((u) => (
                        <option key={u} value={u}>
                          {URGENCY_LABELS[u].label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="md:w-56">
                    <label htmlFor="log-status" className="sr-only">
                      Status
                    </label>
                    <Select
                      id="log-status"
                      value={filters.status}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, status: e.target.value as StatusFilter }))
                      }
                    >
                      {(Object.keys(STATUS_LABELS) as StatusFilter[]).map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              </div>

              {all.length === 0 ? (
                <EmptyState
                  icon={History}
                  title="Nothing sent yet"
                  description="Send a test from the Delivery tab to see how a notification reaches you."
                />
              ) : filtered.length === 0 ? (
                <EmptyState
                  icon={Search}
                  title="No notifications match"
                  description="Try another urgency or status, or clear the search."
                  action={
                    <Button variant="secondary" size="sm" onClick={() => setFilters(NO_FILTERS)}>
                      <X aria-hidden />
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <>
                  <p className="sr-only" role="status">
                    {filtering
                      ? `${filtered.length} of ${all.length} notifications shown`
                      : `${all.length} notifications`}
                  </p>
                  <ul className="divide-y divide-line">
                    {filtered.map((event) => (
                      <DeliveryLogItem key={event.id} event={event} privacy={privacy} />
                    ))}
                  </ul>
                </>
              )}
            </Card>
          </div>
        );
      }}
    </QueryView>
  );
}
