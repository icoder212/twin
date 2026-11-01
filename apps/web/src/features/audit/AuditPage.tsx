import { Download, Fingerprint, ScrollText, ShieldCheck } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { auditQuerySchema, formatNumber, type AuditQuery } from '@twindesk/core';
import { Can } from '@/features/auth/guards';
import { useAuth } from '@/features/auth/use-auth';
import { Page, PageHeader } from '@/shared/components/PageHeader';
import { QueryView } from '@/shared/components/QueryView';
import { useLocale } from '@/shared/hooks/use-locale';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { EmptyState, Skeleton } from '@/shared/ui/feedback';
import { AuditFilters } from './AuditFilters';
import { AuditList } from './AuditList';
import { useAudit, useExportAudit } from './queries';

/** Reads filters from the URL. Anything that does not match the schema falls back to its default. */
function parseQuery(params: URLSearchParams): AuditQuery {
  const { search, action, outcome } = auditQuerySchema.shape;
  const s = search.safeParse(params.get('q') ?? undefined);
  const a = action.safeParse(params.get('action') ?? undefined);
  const o = outcome.safeParse(params.get('outcome') ?? undefined);
  return {
    search: s.success && s.data ? s.data : undefined,
    action: a.success ? a.data : 'all',
    outcome: o.success ? o.data : 'all',
  };
}

function LoadingRows() {
  return (
    <div className="space-y-px p-4" aria-hidden>
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 py-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="hidden h-4 w-24 md:block" />
          <Skeleton className="h-4 flex-1" />
        </div>
      ))}
    </div>
  );
}

export function AuditPage() {
  const [params, setParams] = useSearchParams();
  const query = useMemo(() => parseQuery(params), [params]);
  const audit = useAudit(query);
  const exportAudit = useExportAudit();
  const { user } = useAuth();
  const locale = useLocale();
  const firmWide = user?.role === 'compliance' || user?.role === 'admin';

  const onChange = (patch: Partial<Record<'q' | 'action' | 'outcome', string>>) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (!value || value === 'all') next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );
  };

  return (
    <Page className="space-y-6">
      <PageHeader
        eyebrow="Audit log"
        title="Logged, and yours to audit"
        description="Every answer, task, approval and sign-in is recorded with what happened, when, and who approved it. Records are written by the server and cannot be edited from here."
        actions={
          <Can permission="audit.export">
            <Button
              variant="primary"
              loading={exportAudit.isPending}
              onClick={() => exportAudit.mutate(query)}
            >
              <Download /> Export CSV
            </Button>
          </Can>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-brand-fg">
                <ShieldCheck className="size-4" aria-hidden />
              </span>
              <div>
                <CardTitle>
                  {firmWide ? 'You are seeing the whole firm' : 'You are seeing your own activity'}
                </CardTitle>
                <CardDescription>
                  {firmWide
                    ? 'Compliance and administrators see every record in the firm. Traders and support staff see only their own activity and what the twin did for them.'
                    : 'Traders see their own activity and what the twin did for them. Compliance and administrators see the whole firm. The same rule is enforced by the server.'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-accent">
                <Fingerprint className="size-4" aria-hidden />
              </span>
              <div>
                <CardTitle>Find any answer by its id</CardTitle>
                <CardDescription>
                  Search an id such as <code className="font-mono text-fg">DT-K7P2QA</code> to see
                  what the twin said, when and to whom.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-line p-4 sm:p-5">
          <AuditFilters query={query} onChange={onChange} />
        </div>
        <QueryView query={audit} loading={<LoadingRows />}>
          {(data) =>
            data.items.length === 0 ? (
              <EmptyState
                icon={ScrollText}
                title="No matching records"
                description="Try a different search or clear the filters. Records your role cannot see are never counted."
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5 text-xs text-fg-subtle sm:px-5">
                  <span aria-live="polite">
                    {formatNumber(data.total, locale)} {data.total === 1 ? 'record' : 'records'}
                    {data.total > data.items.length
                      ? `, showing the first ${data.items.length}`
                      : ''}
                  </span>
                  {audit.isFetching ? (
                    <Badge tone="neutral">Updating</Badge>
                  ) : (
                    <span>Newest first</span>
                  )}
                </div>
                <AuditList items={data.items} />
              </>
            )
          }
        </QueryView>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>How records are kept</CardTitle>
            <CardDescription>
              What a compliance lead can rely on when they open this log.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3 text-[13px] leading-relaxed text-fg-muted sm:grid-cols-2 lg:grid-cols-4">
            {[
              [
                'Every answer',
                'Logged with its id, the question, the model, the passages it used and what the advice checks caught.',
              ],
              [
                'Every approval',
                'Who approved or rejected it, when, and who it went to. Nothing is sent without one.',
              ],
              [
                'Every task and workflow',
                'Each run and each step, including runs that stopped instead of guessing.',
              ],
              [
                'Kept as your firm decides',
                'Retention and who can read the log are set by your compliance team. Personal data typed by users is removed before it is written.',
              ],
            ].map(([title, body]) => (
              <li key={title} className="rounded-xl border border-line bg-surface-2/40 p-3.5">
                <p className="text-[13px] font-semibold text-fg">{title}</p>
                <p className="mt-1">{body}</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </Page>
  );
}
