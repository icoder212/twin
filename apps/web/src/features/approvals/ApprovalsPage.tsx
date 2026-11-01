import { ChevronRight, Inbox } from 'lucide-react';
import { useState } from 'react';
import { formatRelative, type Approval } from '@twindesk/core';
import { cn } from '@/lib/cn';
import { Page, PageHeader } from '@/shared/components/PageHeader';
import { QueryView } from '@/shared/components/QueryView';
import { useLocale } from '@/shared/hooks/use-locale';
import { useIsDesktop } from '@/shared/hooks/use-media-query';
import { Badge } from '@/shared/ui/badge';
import { Card } from '@/shared/ui/card';
import { Dialog } from '@/shared/ui/dialog';
import { EmptyState, Skeleton } from '@/shared/ui/feedback';
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/menu';
import { APPROVAL_KINDS } from './approval-meta';
import { ApprovalDetail } from './ApprovalDetail';
import { useApprovals } from './queries';

type View = 'waiting' | 'decided';

export function ApprovalsPage() {
  const approvals = useApprovals();
  const isDesktop = useIsDesktop();
  const [view, setView] = useState<View>('waiting');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const waitingCount = approvals.data?.filter((a) => a.status === 'pending').length ?? 0;

  return (
    <Page>
      <PageHeader
        eyebrow="Approvals"
        title="Nothing leaves without you"
        description="Emails, messages, calendar invitations and replies to anyone else wait here, with the recipients shown before anything is sent. Every decision is logged."
      />

      <Tabs value={view} onValueChange={(v) => setView(v as View)} className="mt-6">
        <TabsList aria-label="Approvals">
          <TabsTrigger value="waiting">
            Waiting
            <span
              className="rounded-full bg-surface-2 px-1.5 font-mono text-[10.5px] text-fg-muted"
              aria-label={`${waitingCount} waiting`}
            >
              {waitingCount}
            </span>
          </TabsTrigger>
          <TabsTrigger value="decided">Decided</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mt-4">
        <QueryView
          query={approvals}
          loading={
            <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-xl" />
                ))}
              </div>
              <Skeleton className="hidden h-96 rounded-2xl lg:block" />
            </div>
          }
        >
          {(data) => {
            const items = data.filter((a) =>
              view === 'waiting' ? a.status === 'pending' : a.status !== 'pending',
            );
            if (items.length === 0) {
              return (
                <Card>
                  <EmptyState
                    icon={Inbox}
                    title={view === 'waiting' ? 'Nothing is waiting for you' : 'No decisions yet'}
                    description={
                      view === 'waiting'
                        ? 'When the twin drafts anything for another person, it waits here until you approve it.'
                        : 'Approved and rejected drafts appear here, with who decided and when.'
                    }
                  />
                </Card>
              );
            }
            const selected = items.find((a) => a.id === selectedId) ?? items[0];
            return (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
                <ul
                  className="space-y-2"
                  aria-label={view === 'waiting' ? 'Waiting for approval' : 'Decided'}
                >
                  {items.map((a) => (
                    <li key={a.id}>
                      <ApprovalListItem
                        approval={a}
                        selected={isDesktop && a.id === selected?.id}
                        onSelect={() => {
                          setSelectedId(a.id);
                          if (!isDesktop) setSheetOpen(true);
                        }}
                      />
                    </li>
                  ))}
                </ul>
                {isDesktop && selected ? (
                  <Card className="h-fit p-6 lg:sticky lg:top-24" aria-live="polite">
                    <ApprovalDetail key={selected.id} approval={selected} />
                  </Card>
                ) : null}
                {!isDesktop && selected ? (
                  <Dialog
                    open={sheetOpen}
                    onOpenChange={setSheetOpen}
                    title={APPROVAL_KINDS[selected.kind].label}
                    variant="sheet-bottom"
                  >
                    <ApprovalDetail
                      key={selected.id}
                      approval={selected}
                      onDecided={() => setSheetOpen(false)}
                    />
                  </Dialog>
                ) : null}
              </div>
            );
          }}
        </QueryView>
      </div>
    </Page>
  );
}

function ApprovalListItem({
  approval,
  selected,
  onSelect,
}: {
  approval: Approval;
  selected: boolean;
  onSelect: () => void;
}) {
  const locale = useLocale();
  const kind = APPROVAL_KINDS[approval.kind];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected || undefined}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-colors',
        selected
          ? 'border-brand-fg/50 bg-brand/10'
          : 'border-line bg-surface hover:border-line-strong',
      )}
    >
      <span
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-surface-2',
          selected ? 'text-brand-fg' : 'text-fg-muted',
        )}
      >
        <kind.icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[13.5px] font-semibold text-fg">{approval.title}</span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-fg-muted">
          To {approval.recipients.map((r) => r.name).join(', ')}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-2">
          <Badge>{kind.label}</Badge>
          {approval.status === 'approved' ? <Badge tone="success">Approved</Badge> : null}
          {approval.status === 'rejected' ? <Badge tone="danger">Rejected</Badge> : null}
          <span className="font-mono text-[10.5px] text-fg-subtle">
            {formatRelative(approval.decidedAt ?? approval.createdAt, locale)}
          </span>
        </span>
      </span>
      <ChevronRight className="mt-2 size-4 shrink-0 text-fg-subtle lg:hidden" aria-hidden />
    </button>
  );
}
