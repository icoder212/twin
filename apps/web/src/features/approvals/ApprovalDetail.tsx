import {
  Ban,
  Check,
  CircleCheck,
  CircleX,
  Paperclip,
  Send,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import {
  approvalDecisionSchema,
  formatDateTime,
  formatRelative,
  type Approval,
} from '@twindesk/core';
import { Can } from '@/features/auth/guards';
import { cn } from '@/lib/cn';
import { ComplianceBadge } from '@/shared/components/ComplianceBadge';
import { useLocale } from '@/shared/hooks/use-locale';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { ConfirmDialog, Dialog } from '@/shared/ui/dialog';
import { ToneIcon } from '@/shared/ui/feedback';
import { Field, Textarea } from '@/shared/ui/field';
import { APPROVAL_KINDS } from './approval-meta';
import { useDecideApproval } from './queries';

export function ApprovalDetail({
  approval,
  onDecided,
}: {
  approval: Approval;
  onDecided?: () => void;
}) {
  const locale = useLocale();
  const decide = useDecideApproval();
  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string>();
  const kind = APPROVAL_KINDS[approval.kind];
  const pending = approval.status === 'pending';

  const approve = () =>
    decide.mutate(
      { id: approval.id, decision: 'approved' },
      {
        onSuccess: () => {
          setConfirming(false);
          onDecided?.();
        },
      },
    );

  const reject = () => {
    const parsed = approvalDecisionSchema.safeParse({
      id: approval.id,
      decision: 'rejected',
      note: note || undefined,
    });
    if (!parsed.success) {
      setNoteError(parsed.error.issues[0]?.message ?? 'Check the note');
      return;
    }
    decide.mutate(parsed.data, {
      onSuccess: () => {
        setRejecting(false);
        setNote('');
        onDecided?.();
      },
    });
  };

  return (
    <article aria-labelledby={`approval-${approval.id}`} className="flex flex-col">
      <header className="flex items-start gap-3">
        <ToneIcon icon={kind.icon} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="brand">{kind.label}</Badge>
            {approval.status === 'approved' ? (
              <Badge tone="success">
                <Check aria-hidden /> Approved
              </Badge>
            ) : approval.status === 'rejected' ? (
              <Badge tone="danger">
                <Ban aria-hidden /> Rejected
              </Badge>
            ) : (
              <Badge tone="warning">Waiting for you</Badge>
            )}
          </div>
          <h2
            id={`approval-${approval.id}`}
            className="mt-2 text-lg leading-snug font-semibold tracking-tight text-fg"
          >
            {approval.title}
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{approval.summary}</p>
          <p className="mt-2 text-xs text-fg-subtle">
            Prepared by {approval.origin} · {formatRelative(approval.createdAt, locale)}
          </p>
        </div>
      </header>

      <section
        aria-label="Recipients"
        className="mt-5 rounded-xl border border-line-strong bg-surface-2/60 p-4"
      >
        <p className="flex items-center gap-2 text-[13px] font-semibold text-fg">
          <Users className="size-4 text-brand-fg" aria-hidden />
          {pending ? 'Goes to, once you approve' : 'Went to'}
        </p>
        <ul className="mt-2 space-y-1.5">
          {approval.recipients.map((r) => (
            <li
              key={`${r.name}-${r.address}`}
              className="flex flex-wrap items-baseline gap-x-2 text-sm"
            >
              <span className="font-medium text-fg">{r.name}</span>
              <span className="font-mono text-xs break-all text-fg-muted">{r.address}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Content" className="mt-4 overflow-hidden rounded-xl border border-line">
        {approval.subject ? (
          <div className="border-b border-line bg-surface-2/40 px-4 py-2.5 text-[13px]">
            <span className="text-fg-subtle">Subject </span>
            <span className="font-medium text-fg">{approval.subject}</span>
          </div>
        ) : null}
        {/* Plain text only: the body is never interpreted as HTML. */}
        <pre className="max-h-80 overflow-auto px-4 py-3 font-sans text-[13.5px] leading-relaxed break-words whitespace-pre-wrap text-fg">
          {approval.body}
        </pre>
        {approval.attachments.length ? (
          <ul
            className="flex flex-wrap gap-2 border-t border-line px-4 py-3"
            aria-label="Attachments"
          >
            {approval.attachments.map((a) => (
              <li
                key={a.name}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-xs text-fg-muted"
              >
                <Paperclip className="size-3.5" aria-hidden />
                <span className="text-fg">{a.name}</span>
                <span className="text-fg-subtle">{a.size}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <details className="group mt-4 rounded-xl border border-line px-4 py-3">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-medium text-fg [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-success" aria-hidden />
            Advice checks on this draft
          </span>
          <ComplianceBadge checks={approval.checks} />
        </summary>
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {approval.checks.map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-xs text-fg-muted">
              {c.passed ? (
                <CircleCheck className="mt-px size-3.5 shrink-0 text-success" aria-label="Passed" />
              ) : (
                <CircleX className="mt-px size-3.5 shrink-0 text-danger" aria-label="Failed" />
              )}
              <span>{c.label}</span>
            </li>
          ))}
        </ul>
      </details>

      {pending ? (
        <Can
          permission="approvals.decide"
          fallback={
            <p className="mt-5 text-[13px] text-fg-subtle">
              Your role can view this draft but not approve it.
            </p>
          }
        >
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="danger" disabled={decide.isPending} onClick={() => setRejecting(true)}>
              <Ban aria-hidden /> Reject
            </Button>
            <Button
              variant="primary"
              disabled={decide.isPending}
              onClick={() => setConfirming(true)}
            >
              <Send aria-hidden /> {kind.action}
            </Button>
          </div>
          <p className="mt-2 text-right text-xs text-fg-subtle">
            Nothing is sent until you approve. Your decision is logged.
          </p>
        </Can>
      ) : (
        <div
          className={cn(
            'mt-5 rounded-xl border p-3 text-[13px]',
            approval.status === 'approved'
              ? 'border-success/30 bg-success/10'
              : 'border-danger/30 bg-danger/10',
          )}
        >
          <p className="text-fg">
            {approval.status === 'approved' ? 'Approved' : 'Rejected'} by{' '}
            <span className="font-medium">{approval.decidedBy ?? 'unknown'}</span>
            {approval.decidedAt ? ` · ${formatDateTime(approval.decidedAt, locale)}` : ''}
          </p>
          {approval.decisionNote ? (
            <p className="mt-1 text-fg-muted">“{approval.decisionNote}”</p>
          ) : null}
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        tone="primary"
        title={kind.action}
        description="Check who this goes to. Once sent it cannot be recalled."
        confirmLabel={approval.kind === 'payout-check' ? 'Approve' : 'Send now'}
        loading={decide.isPending}
        onConfirm={approve}
      >
        <ul className="space-y-1.5 rounded-xl border border-line bg-surface-2/60 p-3">
          {approval.recipients.map((r) => (
            <li key={`${r.name}-${r.address}`} className="text-sm">
              <span className="font-medium text-fg">{r.name}</span>{' '}
              <span className="font-mono text-xs break-all text-fg-muted">{r.address}</span>
            </li>
          ))}
        </ul>
      </ConfirmDialog>

      <Dialog
        open={rejecting}
        onOpenChange={(o) => {
          setRejecting(o);
          if (!o) setNoteError(undefined);
        }}
        title="Reject this draft?"
        description="Nothing will be sent. Add a note for the record if it helps."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={decide.isPending} onClick={reject}>
              Reject
            </Button>
          </>
        }
      >
        <Field label="Note (optional)" hint={`${note.length} of 500 characters`} error={noteError}>
          {(p) => (
            <Textarea
              {...p}
              value={note}
              maxLength={500}
              onChange={(e) => {
                setNote(e.target.value);
                setNoteError(undefined);
              }}
              placeholder="For example: wrong week attached"
            />
          )}
        </Field>
      </Dialog>
    </article>
  );
}
