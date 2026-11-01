import { CalendarClock, Info } from 'lucide-react';
import { ErrorState, EmptyState, Skeleton } from '@/shared/ui/feedback';
import { BriefingCard } from './BriefingCard';
import { useBriefings, useContacts, useNotificationPolicy } from './queries';

export function BriefingsTab() {
  const briefings = useBriefings();
  const policy = useNotificationPolicy();
  const contacts = useContacts();
  const queries = [briefings, policy, contacts];
  const failed = queries.find((q) => q.isError);

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-info/30 bg-info/10 px-4 py-3 text-[13px] leading-relaxed text-fg-muted">
        <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
        <p>
          Briefings go out at the time you set, even during quiet hours, because you scheduled them.
          Other info notifications still wait for your daily summary.
        </p>
      </div>

      {failed ? (
        <ErrorState error={failed.error} onRetry={() => queries.forEach((q) => void q.refetch())} />
      ) : !briefings.data || !policy.data || !contacts.data ? (
        <div className="space-y-5" aria-busy="true">
          <Skeleton className="h-96 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      ) : briefings.data.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No briefings set up"
          description="Your firm has not turned on scheduled briefings yet."
        />
      ) : (
        briefings.data.map((schedule) => (
          <BriefingCard
            key={schedule.kind}
            schedule={schedule}
            policy={policy.data}
            contacts={contacts.data}
          />
        ))
      )}
    </div>
  );
}
