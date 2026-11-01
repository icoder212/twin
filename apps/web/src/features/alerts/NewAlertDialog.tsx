import { Moon } from 'lucide-react';
import { useId } from 'react';
import { useForm, useWatch, type Resolver } from 'react-hook-form';
import { Link } from 'react-router';
import {
  CHANNEL_LABELS,
  DELIVERY_CHANNELS,
  URGENCIES,
  URGENCY_LABELS,
  createAlertInputSchema,
  isApiError,
  isContactChannel,
  userMessage,
  type AlertKind,
  type ContactChannel,
  type CreateAlertInput,
  type DeliveryChannel,
  type NotificationPreferences,
  type Urgency,
} from '@twindesk/core';
import {
  useContacts,
  useNotificationPolicy,
  useNotificationPreferences,
} from '@/features/notifications/queries';
import { CHANNEL_ICONS, URGENCY_META } from '@/features/notifications/notify-meta';
import { cn } from '@/lib/cn';
import { zodResolver } from '@/lib/zod-resolver';
import { toneText } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { Skeleton } from '@/shared/ui/feedback';
import { Checkbox, Field, Input, Select } from '@/shared/ui/field';
import { useCreateAlert } from './queries';
import { ALERT_KINDS, defaultUrgency } from './alert-meta';

interface FormValues {
  kind: AlertKind;
  urgency: Urgency;
  instrument: string;
  level: string;
  thresholdPct: string;
  minutesBefore: string;
  impact: 'high' | 'medium';
  channels: DeliveryChannel[];
}

const DEFAULTS: Omit<FormValues, 'kind' | 'urgency' | 'channels'> = {
  instrument: '',
  level: '',
  thresholdPct: '50',
  minutesBefore: '10',
  impact: 'high',
};

/** Used only if the delivery settings cannot be loaded, so an alert can still be set. */
const FALLBACK_ROUTING: NotificationPreferences['routing'] = {
  info: ['in-app'],
  important: ['in-app', 'push'],
  critical: ['in-app', 'push', 'email'],
};

interface DeliveryOptions {
  routing: NotificationPreferences['routing'];
  allowed: readonly DeliveryChannel[];
  /** Verified contact channels, or null when they could not be loaded. */
  verified: ReadonlySet<ContactChannel> | null;
}

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
      size="lg"
    >
      {open ? (
        <NewAlertLoader initialKind={initialKind} onDone={() => onOpenChange(false)} />
      ) : null}
    </Dialog>
  );
}

/** Waits for the delivery settings so the channels start from the user's own routing. */
function NewAlertLoader({ initialKind, onDone }: { initialKind: AlertKind; onDone: () => void }) {
  const preferences = useNotificationPreferences();
  const policy = useNotificationPolicy();
  const contacts = useContacts();
  if (preferences.isPending || policy.isPending || contacts.isPending) {
    return (
      <div className="flex flex-col gap-3" aria-busy>
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }
  const options: DeliveryOptions = {
    routing: preferences.data?.routing ?? FALLBACK_ROUTING,
    allowed: policy.data?.allowedChannels ?? DELIVERY_CHANNELS,
    verified: contacts.data ? new Set(contacts.data.map((c) => c.channel)) : null,
  };
  return <NewAlertForm initialKind={initialKind} onDone={onDone} options={options} />;
}

function NewAlertForm({
  initialKind,
  onDone,
  options,
}: {
  initialKind: AlertKind;
  onDone: () => void;
  options: DeliveryOptions;
}) {
  const create = useCreateAlert();
  const formId = useId();
  const { routing, allowed, verified } = options;
  // The app is always included; the rest follow the user's routing for that urgency.
  const channelsFor = (urgency: Urgency): DeliveryChannel[] =>
    DELIVERY_CHANNELS.filter(
      (c) => c === 'in-app' || (routing[urgency].includes(c) && allowed.includes(c)),
    );
  const initialUrgency = defaultUrgency(initialKind, Number(DEFAULTS.thresholdPct));
  const {
    register,
    handleSubmit,
    control,
    setError,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<FormValues, unknown, CreateAlertInput>({
    defaultValues: {
      ...DEFAULTS,
      kind: initialKind,
      urgency: initialUrgency,
      channels: channelsFor(initialUrgency),
    },
    // The same schema the API validates with. Fields that belong to other kinds are stripped.
    resolver: zodResolver(createAlertInputSchema) as unknown as Resolver<
      FormValues,
      unknown,
      CreateAlertInput
    >,
  });
  const kind = useWatch({ control, name: 'kind' });
  const urgency = useWatch({ control, name: 'urgency' });
  const channels = useWatch({ control, name: 'channels' });
  const errorFor = (name: string) => (errors as ErrorMap)[name]?.message;

  const applyUrgency = (next: Urgency) => {
    setValue('urgency', next);
    setValue('channels', channelsFor(next));
  };
  const toggleChannel = (channel: DeliveryChannel, on: boolean) => {
    const next = new Set(channels);
    if (on) next.add(channel);
    else next.delete(channel);
    setValue(
      'channels',
      DELIVERY_CHANNELS.filter((c) => c === 'in-app' || next.has(c)),
    );
  };
  const unverified = DELIVERY_CHANNELS.filter(
    (c): c is ContactChannel =>
      isContactChannel(c) && allowed.includes(c) && verified !== null && !verified.has(c),
  );

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
                {...register('kind', {
                  onChange: (e: { target: { value: AlertKind } }) =>
                    applyUrgency(defaultUrgency(e.target.value, Number(getValues('thresholdPct')))),
                })}
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
            <Select
              {...p}
              {...register('thresholdPct', {
                onChange: (e: { target: { value: string } }) =>
                  applyUrgency(defaultUrgency('loss-limit', Number(e.target.value))),
              })}
            >
              <option value="50">Half (50%)</option>
              <option value="80">Most (80%)</option>
              <option value="90">Nearly all (90%)</option>
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
        <legend className="mb-2 text-[13px] font-medium text-fg">How urgent is it?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {URGENCIES.map((u) => {
            const meta = URGENCY_META[u];
            return (
              <label
                key={u}
                className={cn(
                  'flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors',
                  urgency === u
                    ? 'border-brand-fg/60 bg-brand/10'
                    : 'border-line hover:border-line-strong',
                )}
              >
                <input
                  type="radio"
                  value={u}
                  {...register('urgency', {
                    onChange: (e: { target: { value: Urgency } }) =>
                      setValue('channels', channelsFor(e.target.value)),
                  })}
                  className="mt-0.5 accent-brand"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold text-fg">
                    <meta.icon className={cn('size-3.5', toneText[meta.tone])} aria-hidden />
                    {URGENCY_LABELS[u].label}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-fg-muted">
                    {URGENCY_LABELS[u].examples}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-[13px] font-medium text-fg">How should it reach you?</legend>
        <p className="mb-2 text-xs text-fg-muted">
          Ticked from your delivery settings for this urgency. Change them for this alert only.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {DELIVERY_CHANNELS.map((channel) => {
            const Icon = CHANNEL_ICONS[channel];
            const locked = channel === 'in-app';
            const off = !locked && !allowed.includes(channel);
            const notVerified = unverified.includes(channel as ContactChannel);
            const checked = !off && channels.includes(channel);
            const note = locked
              ? 'Always on'
              : off
                ? 'Off for your firm'
                : notVerified
                  ? 'Not verified yet'
                  : null;
            const noteId = `${formId}-channel-${channel}`;
            return (
              <label
                key={channel}
                className={cn(
                  'flex min-h-11 items-start gap-2.5 rounded-lg border px-3 py-2 text-[13px] transition-colors',
                  off || locked ? 'cursor-not-allowed' : 'cursor-pointer hover:border-line-strong',
                  off ? 'border-line opacity-60' : checked ? 'border-brand-fg/50' : 'border-line',
                )}
              >
                <Checkbox
                  checked={checked}
                  disabled={off || locked}
                  aria-describedby={note ? noteId : undefined}
                  onChange={(e) => toggleChannel(channel, e.target.checked)}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="flex items-start gap-1.5 leading-snug font-medium text-fg">
                    <Icon className="mt-0.5 size-3.5 shrink-0 text-fg-muted" aria-hidden />
                    <span className="min-w-0 break-words">{CHANNEL_LABELS[channel]}</span>
                  </span>
                  {note ? (
                    <span
                      id={noteId}
                      className={cn(
                        'mt-0.5 block text-[11.5px]',
                        notVerified ? 'text-warning' : 'text-fg-subtle',
                      )}
                    >
                      {note}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
        {errorFor('channels') ? (
          <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
            {errorFor('channels')}
          </p>
        ) : null}
        {unverified.length ? (
          <p className="mt-2 text-xs leading-relaxed text-fg-muted">
            {unverified.map((c) => CHANNEL_LABELS[c]).join(' and ')}{' '}
            {unverified.length === 1 ? 'is' : 'are'} skipped until verified.{' '}
            <Link
              to="/notifications?tab=contacts"
              className="font-medium text-brand-fg hover:underline"
            >
              Verify in Contacts
            </Link>
          </p>
        ) : null}
        <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-fg-subtle">
          <Moon className="mt-px size-3.5 shrink-0" aria-hidden />
          Quiet hours and your daily summary still apply. Critical alerts can come through quiet
          hours.
        </p>
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
