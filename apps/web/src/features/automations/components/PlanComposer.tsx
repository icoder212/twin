import { Sparkles, WandSparkles } from 'lucide-react';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  planRequestSchema,
  userMessage,
  type AutomationKind,
  type AutomationPlan,
} from '@twindesk/core';
import type { z } from 'zod';
import { useTenant } from '@/features/tenant/tenant-context';
import { zodResolver } from '@/lib/zod-resolver';
import { Button } from '@/shared/ui/button';
import { Field, Textarea } from '@/shared/ui/field';
import { EXAMPLES } from '../labels';
import { usePlanAutomation } from '../queries';

const composerSchema = planRequestSchema.pick({ instruction: true });
const MAX = 1000;

interface PlanComposerProps {
  kind: AutomationKind;
  initialInstruction?: string;
  onPlanned: (plan: AutomationPlan) => void;
}

/** "Say it once": one plain-English instruction becomes a plan the user checks before saving. */
export function PlanComposer({ kind, initialInstruction = '', onPlanned }: PlanComposerProps) {
  const { tenant } = useTenant();
  const plan = usePlanAutomation();
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    setFocus,
    control,
    formState: { errors },
  } = useForm<z.input<typeof composerSchema>, unknown, z.output<typeof composerSchema>>({
    resolver: zodResolver(composerSchema),
    defaultValues: { instruction: initialInstruction },
  });
  const instruction = useWatch({ control, name: 'instruction' }) ?? '';

  useEffect(() => {
    if (initialInstruction) setFocus('instruction');
  }, [initialInstruction, setFocus]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      onPlanned(await plan.mutateAsync({ kind, instruction: values.instruction }));
    } catch (error) {
      setError('instruction', { message: userMessage(error) });
    }
  });

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-4 rounded-2xl p-5 glass-strong"
    >
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-lg brand-gradient text-on-brand">
          <Sparkles className="size-4" aria-hidden />
        </span>
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-fg">Describe the job</h2>
          <p className="text-xs text-fg-subtle">
            {tenant.productName} writes the steps and shows you the plan. Nothing runs until you
            save it.
          </p>
        </div>
      </div>

      <Field
        label={
          kind === 'task'
            ? 'What should it do, and when?'
            : 'Where should it read from, and where does the result go?'
        }
        error={errors.instruction?.message}
        aside={
          <span className="font-mono text-[11px] text-fg-subtle tabular" aria-hidden>
            {instruction.length}/{MAX}
          </span>
        }
      >
        {(props) => (
          <Textarea
            {...props}
            {...register('instruction')}
            rows={3}
            maxLength={MAX}
            placeholder={EXAMPLES[kind][0]?.instruction}
            className="min-h-28 bg-surface/80 text-[14px]"
          />
        )}
      </Field>

      <div>
        <p className="mb-2 text-xs text-fg-subtle" id={`examples-${kind}`}>
          Or start from an example
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby={`examples-${kind}`}>
          {EXAMPLES[kind].map((example) => (
            <button
              key={example.label}
              type="button"
              onClick={() => {
                setValue('instruction', example.instruction, {
                  shouldDirty: true,
                  shouldValidate: false,
                });
                setFocus('instruction');
              }}
              className="min-h-9 rounded-full border border-line bg-surface-2/70 px-3 text-[13px] text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
            >
              {example.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col-reverse items-stretch gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-fg-subtle" aria-live="polite">
          {plan.isPending
            ? 'Planning the steps, sources and schedule…'
            : 'Reads only what you allow. Anything sent to another person waits for you.'}
        </p>
        <Button type="submit" variant="primary" loading={plan.isPending} className="sm:w-auto">
          {plan.isPending ? null : <WandSparkles aria-hidden />}
          Plan the steps
        </Button>
      </div>
    </form>
  );
}
