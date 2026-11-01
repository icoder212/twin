import {
  ArrowUpRight,
  Bell,
  Inbox,
  ListChecks,
  MessageSquareQuote,
  ShieldBan,
  SquareSlash,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { DESK_LABELS, type Suggestion } from '@twindesk/core';
import { useAuth } from '@/features/auth/use-auth';
import { useTenant } from '@/features/tenant/tenant-context';
import { Skeleton } from '@/shared/ui/feedback';
import { useSuggestions } from './queries';

const KIND_ICON: Record<Suggestion['kind'], LucideIcon> = {
  ask: MessageSquareQuote,
  shortcut: SquareSlash,
  task: ListChecks,
  workflow: Workflow,
  alert: Bell,
  approve: Inbox,
  break: ShieldBan,
};

export function Welcome({
  onAsk,
  compact,
}: {
  onAsk: (prompt: string) => void;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const { tenant, isEnabled } = useTenant();
  const navigate = useNavigate();
  const suggestions = useSuggestions(user?.deskType ?? 'independent-trader');
  if (!user) return null;

  const run = (s: Suggestion) => {
    if (s.kind === 'task' && isEnabled('tasks'))
      void navigate('/tasks', { state: { instruction: s.prompt } });
    else if (s.kind === 'workflow' && isEnabled('workflows'))
      void navigate('/workflows', { state: { instruction: s.prompt } });
    else onAsk(s.prompt);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-brand-fg/30 bg-brand/10 px-2.5 py-0.5 text-[11px] font-semibold text-brand-fg">
          Set up for {DESK_LABELS[user.deskType].short}
        </span>
        <span className="text-[11px] text-fg-subtle">Demo runs on sample data</span>
      </div>
      <h1
        className={
          compact
            ? 'mt-4 text-xl font-semibold tracking-tight text-fg'
            : 'mt-4 text-[28px] leading-tight font-semibold tracking-tight text-fg sm:text-[32px]'
        }
      >
        Ask it what you would ask <span className="text-gradient">your desk</span>
      </h1>
      <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-fg-muted">
        {tenant.productName} answers from your rules, history and notes, cites each source, and runs
        every answer through eight advice checks before you see a word. Pick a card, or type{' '}
        <span className="font-mono text-brand-fg">/</span> for your shortcuts.
      </p>

      <ul className="mt-7 grid gap-2.5 sm:grid-cols-2">
        {suggestions.isPending
          ? Array.from({ length: 6 }, (_, i) => (
              <li key={i}>
                <Skeleton className="h-[74px] rounded-xl" />
              </li>
            ))
          : (suggestions.data ?? []).map((s) => {
              const Icon = KIND_ICON[s.kind];
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => run(s)}
                    className="group flex h-full w-full items-start gap-3 rounded-xl border border-line bg-surface/80 p-3.5 text-left transition-colors hover:border-line-strong hover:bg-surface-2"
                  >
                    <span
                      className={`grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 ${s.kind === 'break' ? 'text-danger' : 'text-brand-fg'}`}
                    >
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 text-[13px] font-semibold text-fg">
                        {s.label}
                        <ArrowUpRight
                          className="size-3.5 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100"
                          aria-hidden
                        />
                      </span>
                      <span className="mt-0.5 block text-[12.5px] leading-snug text-fg-muted">
                        {s.kind === 'shortcut' || s.kind === 'alert' || s.kind === 'approve' ? (
                          <>
                            <span className="font-mono text-brand-fg">{s.prompt}</span> {s.hint}
                          </>
                        ) : (
                          s.hint
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
      </ul>
    </div>
  );
}
