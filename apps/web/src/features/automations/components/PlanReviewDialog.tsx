import { CalendarClock, ShieldCheck, UsersRound } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  isApiError,
  shortcutCommandSchema,
  userMessage,
  type Automation,
  type AutomationPlan,
} from '@twindesk/core';
import { zodResolver } from '@/lib/zod-resolver';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { Field, Input } from '@/shared/ui/field';
import { KIND_COPY } from '../labels';
import { useSaveAutomation } from '../queries';
import { FlowDiagram } from './FlowDiagram';
import { StepList } from './StepList';

const reviewSchema = z.object({
  name: z.string().trim().min(1, 'Give it a name').max(80, 'Keep the name under 80 characters'),
  shortcut: z
    .string()
    .trim()
    .toLowerCase()
    .refine(
      (v) => v === '' || shortcutCommandSchema.safeParse(v).success,
      'Use a slash and 2 to 24 lowercase letters, for example /review',
    ),
});

type Answers = Record<string, string>;

/** Folds the answers to the twin's clarifying questions into the draft. */
function applyAnswers(plan: AutomationPlan, answers: Answers): Automation {
  let next: Automation = {
    ...plan.draft,
    steps: plan.draft.steps.map((s) => ({ ...s })),
    recipients: [...plan.draft.recipients],
  };
  for (const q of plan.questions) {
    const answer = answers[q.id];
    if (!answer) continue;
    if (q.id === 'recipient') next = { ...next, recipients: answer === 'Only me' ? [] : [answer] };
    if (q.id === 'schedule') {
      next = {
        ...next,
        schedule: answer.startsWith('Only')
          ? { kind: 'manual', label: 'When you run it' }
          : { kind: 'schedule', label: answer },
      };
    }
    if (q.id === 'account') {
      const account = answer === 'Both' ? 'Live 4471 and Demo 2290' : answer.replace('MT5 · ', '');
      next = {
        ...next,
        steps: next.steps.map((s) =>
          s.verb === 'read' && s.system === 'MetaTrader 5'
            ? { ...s, description: `Read from MetaTrader 5 (${account}), read-only` }
            : s,
        ),
      };
    }
    if (q.id === 'rules') {
      const version = answer.startsWith('Version 2') ? 'version 2' : 'version 3';
      next = {
        ...next,
        steps: next.steps.map((s) =>
          s.verb === 'check'
            ? { ...s, description: s.description.replace(/version \d+/i, version) }
            : s,
        ),
      };
    }
  }
  return next;
}

function suggestedShortcut(name: string): string {
  const word = name
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .find((w) => w.length >= 3);
  return word ? `/${word.slice(0, 12)}` : '';
}

interface PlanReviewDialogProps {
  plan: AutomationPlan | null;
  onClose: () => void;
  onSaved: (automation: Automation) => void;
}

export function PlanReviewDialog({ plan, onClose, onSaved }: PlanReviewDialogProps) {
  const kind = plan?.draft.kind ?? 'task';
  return (
    <Dialog
      open={plan !== null}
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      title={`Check the plan before it runs`}
      description={`Your ${KIND_COPY[kind].singular}, written from one instruction. Change anything you like, then save.`}
      bodyClassName="p-0"
    >
      {plan ? (
        <ReviewBody key={plan.draft.id} plan={plan} onClose={onClose} onSaved={onSaved} />
      ) : null}
    </Dialog>
  );
}

function ReviewBody({
  plan,
  onClose,
  onSaved,
}: {
  plan: AutomationPlan;
  onClose: () => void;
  onSaved: (a: Automation) => void;
}) {
  const groupId = useId();
  const save = useSaveAutomation();
  const [answers, setAnswers] = useState<Answers>(() =>
    Object.fromEntries(plan.questions.map((q) => [q.id, q.options[0] ?? ''])),
  );
  const preview = useMemo(() => applyAnswers(plan, answers), [plan, answers]);
  const copy = KIND_COPY[plan.draft.kind];

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<z.input<typeof reviewSchema>, unknown, z.output<typeof reviewSchema>>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { name: plan.draft.name, shortcut: plan.draft.shortcut ?? '' },
  });

  const onSubmit = handleSubmit(async ({ name, shortcut }) => {
    try {
      const saved = await save.mutateAsync({ ...preview, name, shortcut: shortcut || undefined });
      onSaved(saved);
    } catch (error) {
      const fields = isApiError(error) ? (error.fieldErrors ?? {}) : {};
      let handled = false;
      for (const key of ['name', 'shortcut'] as const) {
        if (fields[key]) {
          setError(key, { message: fields[key] });
          handled = true;
        }
      }
      if (!handled) setError('root', { message: userMessage(error) });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col">
      <div className="flex flex-col gap-6 px-5 py-5">
        <div className="flex flex-col gap-3">
          <p className="font-mono text-[11px] tracking-[0.14em] text-fg-subtle uppercase">
            Planned: {preview.steps.length} steps, {preview.sources.length}{' '}
            {preview.sources.length === 1 ? 'source' : 'sources'}, {preview.destinations.length}{' '}
            {preview.destinations.length === 1 ? 'destination' : 'destinations'}
          </p>
          <blockquote className="rounded-xl border-l-2 border-brand-fg/60 bg-surface-2/60 px-4 py-3 text-[13.5px] leading-relaxed text-fg-muted">
            {plan.draft.instruction}
          </blockquote>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" error={errors.name?.message}>
            {(props) => (
              <Input {...props} {...register('name')} maxLength={80} autoComplete="off" />
            )}
          </Field>
          <Field
            label="Shortcut (optional)"
            hint="Run it any time by typing this word."
            error={errors.shortcut?.message}
          >
            {(props) => (
              <Input
                {...props}
                {...register('shortcut')}
                maxLength={25}
                placeholder={suggestedShortcut(plan.draft.name) || '/review'}
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="none"
                className="font-mono"
              />
            )}
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CalendarClock className="size-4 text-fg-subtle" aria-hidden />
          <span className="text-[13px] text-fg-muted">Runs</span>
          <Badge tone="brand">{preview.schedule.label}</Badge>
        </div>

        {plan.questions.length ? (
          <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface-2/40 p-4">
            <p className="text-[13px] font-semibold text-fg">
              A few questions, the first time only
            </p>
            {plan.questions.map((q) => (
              <fieldset key={q.id}>
                <legend className="text-[13px] text-fg-muted">{q.question}</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {q.options.map((option) => (
                    <label key={option} className="cursor-pointer">
                      <input
                        type="radio"
                        name={`${groupId}-${q.id}`}
                        value={option}
                        checked={answers[q.id] === option}
                        onChange={() => setAnswers((a) => ({ ...a, [q.id]: option }))}
                        className="peer sr-only"
                      />
                      <span className="inline-flex min-h-9 items-center rounded-full border border-line bg-surface px-3 text-[13px] text-fg-muted transition-colors peer-checked:border-brand-fg/60 peer-checked:bg-brand/15 peer-checked:text-fg peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-fg">
                        {option}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        ) : null}

        {preview.kind === 'workflow' ? (
          <FlowDiagram sources={preview.sources} destinations={preview.destinations} />
        ) : null}

        <section aria-labelledby={`${groupId}-steps`}>
          <h3 id={`${groupId}-steps`} className="mb-3 text-[13px] font-semibold text-fg">
            {preview.steps.length} steps, written for you
          </h3>
          <StepList steps={preview.steps} />
        </section>

        <div className="flex items-start gap-2.5 rounded-xl border border-line p-3.5">
          <UsersRound className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
          <div className="text-[13px]">
            <p className="font-medium text-fg">
              {preview.recipients.length
                ? `Goes to ${preview.recipients.join(', ')}`
                : 'Only you. Nothing goes to anyone else.'}
            </p>
            <p className="mt-0.5 text-xs text-fg-subtle">
              Emails, messages and invitations to anyone else wait for your approval.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2.5 rounded-xl border border-success/25 bg-success/5 p-3.5">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          <p className="text-[13px] text-fg-muted">
            <span className="font-semibold text-fg">The line it holds: </span>
            It does the legwork. Decisions, trades and anything sent in your name stay with you.
          </p>
        </div>

        {errors.root?.message ? (
          <p
            role="alert"
            className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger"
          >
            {errors.root.message}
          </p>
        ) : null}
      </div>

      <div className="sticky bottom-0 z-20 flex flex-col-reverse gap-2 border-t border-line bg-surface px-5 py-3 pb-safe sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={save.isPending}>
          Save {copy.singular}
        </Button>
      </div>
    </form>
  );
}
