import { formatDateTime, type BriefingKind } from '@twindesk/core';
import { useTenant } from '@/features/tenant/tenant-context';
import { QueryView } from '@/shared/components/QueryView';
import { useLocale } from '@/shared/hooks/use-locale';
import { Skeleton } from '@/shared/ui/feedback';
import { useBriefingPreview } from './queries';

/** The briefing as it arrives, built from today's data and the saved sections. Text only. */
export function BriefingPreview({ kind, stale }: { kind: BriefingKind; stale: boolean }) {
  const { tenant } = useTenant();
  const locale = useLocale();
  const query = useBriefingPreview(kind);

  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-line bg-surface-2/40">
      <p className="px-4 pt-3 font-mono text-[10px] tracking-[0.16em] text-fg-subtle uppercase">
        As it arrives
      </p>
      <QueryView
        query={query}
        loading={
          <div className="space-y-3 px-4 py-3">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-4 h-4 w-40" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
          </div>
        }
      >
        {(briefing) => (
          <>
            <div className="border-b border-line px-4 pt-1 pb-3">
              <p className="text-[15px] font-semibold tracking-tight text-fg">{briefing.title}</p>
              <p className="mt-0.5 text-xs text-fg-subtle">
                {tenant.productName} ·{' '}
                <time dateTime={briefing.generatedAt}>
                  {formatDateTime(briefing.generatedAt, locale)}
                </time>
              </p>
            </div>
            {stale ? (
              <p className="border-b border-line bg-warning/10 px-4 py-2 text-xs text-fg-muted">
                This preview shows your saved settings. Save to update it.
              </p>
            ) : null}
            <div className="max-h-[30rem] space-y-4 overflow-y-auto px-4 py-4">
              {briefing.sections.map((section) => (
                <section key={section.id} aria-labelledby={`${kind}-${section.id}`}>
                  <h3
                    id={`${kind}-${section.id}`}
                    className="text-[12px] font-semibold tracking-wide text-fg"
                  >
                    {section.heading}
                  </h3>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-fg-muted marker:text-fg-subtle">
                    {section.items.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
      </QueryView>
    </div>
  );
}
