import { Lock } from 'lucide-react';
import type { AutomationStep } from '@twindesk/core';
import { cn } from '@/lib/cn';
import { Badge } from '@/shared/ui/badge';
import { Tooltip } from '@/shared/ui/menu';
import { VERB_LABELS } from '../labels';

/** Numbered steps as a vertical timeline. Steps that reach another person show a lock. */
export function StepList({ steps, className }: { steps: AutomationStep[]; className?: string }) {
  return (
    <ol className={cn('relative flex flex-col', className)}>
      {steps.map((step, index) => {
        const verb = VERB_LABELS[step.verb];
        const last = index === steps.length - 1;
        return (
          <li key={step.id} className="relative flex gap-3 pb-4 last:pb-0">
            {!last ? (
              <span
                aria-hidden
                className="absolute top-7 bottom-0 left-[13px] w-px bg-line-strong/70"
              />
            ) : null}
            <span
              aria-hidden
              className="relative z-10 grid size-7 shrink-0 place-items-center rounded-full border border-line-strong bg-surface-2 font-mono text-[11px] font-semibold text-fg-muted"
            >
              {index + 1}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={verb.tone}>{verb.label}</Badge>
                <span className="text-[13px] font-medium text-fg">{step.system}</span>
                {step.needsApproval ? (
                  <Tooltip content="Waits for your approval before anything is sent">
                    <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">
                      <Lock className="size-3" aria-hidden />
                      Needs approval
                    </span>
                  </Tooltip>
                ) : null}
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{step.description}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
