import { CheckCircle2, Circle, ExternalLink, Inbox, TriangleAlert, XCircle } from 'lucide-react';
import { Link } from 'react-router';
import type { AnswerBlock, Tone } from '@twindesk/core';
import { cn } from '@/lib/cn';
import { StatusDot } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { CitationChip } from './RichText';

const checklistState = {
  ok: { icon: CheckCircle2, className: 'text-success', label: 'Within your rules' },
  attention: { icon: TriangleAlert, className: 'text-warning', label: 'Needs attention' },
  breach: { icon: XCircle, className: 'text-danger', label: 'Outside your rules' },
  todo: { icon: Circle, className: 'text-fg-subtle', label: 'To do' },
} as const;

export function AnswerBlocks({
  blocks,
  onCitation,
}: {
  blocks: AnswerBlock[];
  onCitation: (n: number) => void;
}) {
  if (!blocks.length) return null;
  return (
    <div className="mt-4 space-y-3">
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} onCitation={onCitation} />
      ))}
    </div>
  );
}

function BlockView({ block, onCitation }: { block: AnswerBlock; onCitation: (n: number) => void }) {
  switch (block.type) {
    case 'checklist':
      return (
        <section className="rounded-xl border border-line bg-surface-2/50">
          <h3 className="border-b border-line px-4 py-2.5 text-[12.5px] font-semibold text-fg">
            {block.title}
          </h3>
          <ul className="divide-y divide-line">
            {block.items.map((item, i) => {
              const state = checklistState[item.state];
              return (
                <li key={i} className="flex gap-3 px-4 py-2.5">
                  <state.icon
                    className={cn('mt-0.5 size-4 shrink-0', state.className)}
                    aria-label={state.label}
                  />
                  <div className="min-w-0">
                    <p className="text-[13.5px] text-fg">{item.label}</p>
                    {item.meta ? (
                      <p className="mt-0.5 text-xs text-fg-subtle">{item.meta}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      );
    case 'table':
      return (
        <section className="overflow-hidden rounded-xl border border-line">
          <h3 className="border-b border-line bg-surface-2/50 px-4 py-2.5 text-[12.5px] font-semibold text-fg">
            {block.title}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-[11px] tracking-[0.06em] text-fg-subtle uppercase">
                  {block.columns.map((c) => (
                    <th key={c} scope="col" className="px-4 py-2 font-medium whitespace-nowrap">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, r) => (
                  <tr key={r} className="border-b border-line last:border-0">
                    {row.map((cell, c) => (
                      <td
                        key={c}
                        className={cn(
                          'px-4 py-2',
                          block.monoColumns?.includes(c)
                            ? 'font-mono text-[12.5px] text-fg tabular'
                            : 'text-fg-muted',
                        )}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      );
    case 'metrics':
      return (
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Figures">
          {block.items.map((m) => (
            <div
              key={m.label}
              className="rounded-xl border border-line bg-surface-2/50 px-3 py-2.5"
            >
              <p className="flex items-center gap-1.5 text-[11.5px] text-fg-subtle">
                {m.tone !== 'neutral' ? (
                  <StatusDot tone={m.tone as Tone} className="size-1.5" />
                ) : null}
                {m.label}
              </p>
              <p className="mt-1 text-[17px] font-semibold text-fg">{m.value}</p>
              {m.hint ? <p className="text-[11px] text-fg-subtle">{m.hint}</p> : null}
            </div>
          ))}
        </section>
      );
    case 'approval':
      return (
        <section className="flex flex-col gap-3 rounded-xl border border-brand-fg/30 bg-brand/8 p-4 sm:flex-row sm:items-center">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand/15 text-brand-fg">
            <Inbox className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold text-fg">
              {block.title}: waiting for your approval
            </p>
            <p className="mt-0.5 text-xs text-fg-muted">
              To {block.recipients.join(', ')}. Nothing is sent until you approve.
            </p>
          </div>
          <Button asChild size="sm" variant="primary">
            <Link to="/approvals" state={{ approvalId: block.approvalId }}>
              Review and approve
            </Link>
          </Button>
        </section>
      );
    case 'links':
      return (
        <section className="rounded-xl border border-line">
          <h3 className="border-b border-line px-4 py-2.5 text-[12.5px] font-semibold text-fg">
            {block.title}
          </h3>
          <ul className="divide-y divide-line">
            {block.items.map((item) => (
              <li key={item.citation} className="flex items-center gap-3 px-4 py-2.5">
                <CitationChip n={item.citation} onClick={onCitation} />
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg">{item.label}</span>
                <span className="hidden shrink-0 text-xs text-fg-subtle sm:block">{item.meta}</span>
                <ExternalLink className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
              </li>
            ))}
          </ul>
        </section>
      );
  }
}
