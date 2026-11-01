import { useId } from 'react';
import { useForm, useWatch, type Resolver } from 'react-hook-form';
import {
  createAlertInputSchema,
  isApiError,
  userMessage,
  type AlertKind,
  type CreateAlertInput,
} from '@twindesk/core';
import { cn } from '@/lib/cn';
import { zodResolver } from '@/lib/zod-resolver';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { Checkbox, Field, Input, Select } from '@/shared/ui/field';
import { useCreateAlert } from './queries';
import { ALERT_KINDS, CHANNEL_LABELS } from './alert-meta';

interface FormValues {
  kind: AlertKind;
  instrument: string;
  level: string;
  thresholdPct: string;
  minutesBefore: string;
  impact: 'high' | 'medium';
  channels: string[];
}

const DEFAULTS: FormValues = {
  kind: 'price',
  instrument: '',
  level: '',
  thresholdPct: '50',
  minutesBefore: '10',
  impact: 'high',
  channels: ['in-app', 'push'],
};

type ErrorMap = Record<string, { message?: string } | undefined>;

export function NewAlertDialog({
  open,
  onOpenChange,
  initialKind = 'price',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialKind?: AlertKind;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New alert"
      description="Alerts describe what happened against levels and rules you set. They never suggest a trade."
      size="md"
    >
      {open ? <NewAlertForm initialKind={initialKind} onDone={() => onOpenChange(false)} /> : null}
    </Dialog>
  );
}

function NewAlertForm({ initialKind, onDone }: { initialKind: AlertKind; onDone: () => void }) {
  const create = useCreateAlert();
  const formId = useId();
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<FormValues, unknown, CreateAlertInput>({
    defaultValues: { ...DEFAULTS, kind: initialKind },
    // The same schema the API validates with. Fields that belong to other kinds are stripped.
    resolver: zodResolver(createAlertInputSchema) as unknown as Resolver<
      FormValues,
      unknown,
      CreateAlertInput
    >,
  });
  const kind = useWatch({ control, name: 'kind' });
  const errorFor = (name: string) => (errors as ErrorMap)[name]?.message;

  const onSubmit = handleSubmit((values) => {
    create.mutate(values, {
      onSuccess: onDone,
      onError: (error) => {
        if (isApiError(error) && error.fieldErrors) {
          for (const [field, message] of Object.entries(error.fieldErrors)) {
            setError(field as keyof FormValues, { message });
          }
        } else {
          setError('root', { message: userMessage(error) });
        }
      },
    });
  });

  return (
    <form id={formId} onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-5">
      <fieldset>
        <legend className="mb-2 text-[13px] font-medium text-fg">What should it watch?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {ALERT_KINDS.map((k) => (
            <label
              key={k.kind}
              className={cn(
                'flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
                kind === k.kind
                  ? 'border-brand-fg/60 bg-brand/10'
                  : 'border-line hover:border-line-strong',
              )}
            >
              <input
                type="radio"
                value={k.kind}
                {...register('kind')}
                className="mt-0.5 accent-brand"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-[13px] font-semibold text-fg">
                  <k.icon className="size-3.5 text-brand-fg" aria-hidden />
                  {k.short}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-fg-muted">
                  {k.label}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {kind === 'price' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Instrument"
            hint="For example EURUSD or XAUUSD"
            error={errorFor('instrument')}
          >
            {(p) => (
              <Input
                {...p}
                {...register('instrument')}
                placeholder="EURUSD"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                maxLength={12}
                className="font-mono uppercase"
              />
            )}
          </Field>
          <Field label="Level" hint="Notify when it trades here" error={errorFor('level')}>
            {(p) => (
              <Input
                {...p}
                {...register('level')}
                inputMode="decimal"
                placeholder="1.0900"
                autoComplete="off"
                className="font-mono"
              />
            )}
          </Field>
        </div>
      ) : null}

      {kind === 'loss-limit' ? (
        <Field
          label="Share of your daily loss limit"
          hint="50% is half, 80% is most. Your limit is 5% of the day’s starting equity."
          error={errorFor('thresholdPct')}
        >
          {(p) => (
            <Select {...p} {...register('thresholdPct')}>
              <option value="50">Half (50%)</option>
              <option value="80">Most (80%)</option>
              <option value="25">A quarter (25%)</option>
              <option value="100">All of it (100%)</option>
            </Select>
          )}
        </Field>
      ) : null}

      {kind === 'release' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Minutes before" error={errorFor('minutesBefore')}>
            {(p) => (
              <Input
                {...p}
                {...register('minutesBefore')}
                type="number"
                min={1}
                max={120}
                inputMode="numeric"
              />
            )}
          </Field>
          <Field label="Releases" error={errorFor('impact')}>
            {(p) => (
              <Select {...p} {...register('impact')}>
                <option value="high">High impact only</option>
                <option value="medium">Medium and high impact</option>
              </Select>
            )}
          </Field>
        </div>
      ) : null}

      {kind === 'session-rule' ? (
        <p className="rounded-xl border border-line bg-surface-2/60 p-3 text-[13px] leading-relaxed text-fg-muted">
          Your session rule is <span className="font-medium text-fg">London 07:00 to 16:30</span>{' '}
          (Rule 2, version 3). You’ll be told when a trade opens outside it. Change the rule itself
          in your written rules.
        </p>
      ) : null}

      <fieldset>
        <legend className="mb-2 text-[13px] font-medium text-fg">How should it reach you?</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(CHANNEL_LABELS) as Array<keyof typeof CHANNEL_LABELS>).map((channel) => (
            <label
              key={channel}
              className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-line px-3 text-[13px] text-fg hover:border-line-strong"
            >
              <Checkbox value={channel} {...register('channels')} />
              {CHANNEL_LABELS[channel]}
            </label>
          ))}
        </div>
        {errorFor('channels') ? (
          <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
            {errorFor('channels')}
          </p>
        ) : null}
      </fieldset>

      {errors.root?.message ? (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger"
        >
          {errors.root.message}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={create.isPending}>
          Set alert
        </Button>
      </div>
    </form>
  );
}
