import { Check, CircleSlash, Clock, Moon, Send, Sun } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  CHANNEL_LABELS,
  DEFAULT_SESSION_HOURS,
  DELIVERY_CHANNELS,
  URGENCIES,
  URGENCY_LABELS,
  isContactChannel,
  isQuietNow,
  localClock,
  planDeliveries,
  planEscalation,
  renderMessage,
  type Contact,
  type DeliveryChannel,
  type DeliveryContext,
  type NotificationPolicy,
  type NotificationPreferences,
  type PlannedDelivery,
  type RenderableEvent,
  type Urgency,
} from '@twindesk/core';
import { useTenant } from '@/features/tenant/tenant-context';
import { cn } from '@/lib/cn';
import { useLocale } from '@/shared/hooks/use-locale';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { ErrorState, Skeleton } from '@/shared/ui/feedback';
import { Field, Input, Select, Switch } from '@/shared/ui/field';
import { MessagePreview } from './MessagePreview';
import { CHANNEL_ICONS, URGENCY_META } from './notify-meta';
import {
  useContacts,
  useNotificationPolicy,
  useNotificationPreferences,
  useSendTest,
  useUpdatePreferences,
} from './queries';

/** Sample alerts for the preview. Figures are illustrative and come from the rule engine in use. */
const SAMPLES: Record<Urgency, RenderableEvent> = {
  info: {
    ref: 'NT-PREV01',
    topic: 'approval',
    urgency: 'info',
    title: 'Session recap ready for approval',
    body: 'The email to Jordan Ellis is waiting for you. Nothing is sent until you approve.',
  },
  important: {
    ref: 'NT-PREV02',
    topic: 'loss-limit',
    urgency: 'important',
    title: '80% of your daily loss limit used',
    body: 'Daily loss is 4.0% of your 5% limit. It resets at 22:00 UK time.',
  },
  critical: {
    ref: 'NT-PREV03',
    topic: 'source-health',
    urgency: 'critical',
    title: 'MetaTrader 5 stopped fetching',
    body: 'No new records for 10 minutes during your session, so the rule watch may be out of date.',
  },
};

const ESCALATION_MINUTES = [2, 5, 10, 15, 30];

export function DeliveryTab({ onOpenTab }: { onOpenTab: (tab: string) => void }) {
  const prefs = useNotificationPreferences();
  const policy = useNotificationPolicy();
  const contacts = useContacts();

  if (prefs.isPending || policy.isPending || contacts.isPending) {
    return (
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }
  const failed = [prefs, policy, contacts].find((q) => q.isError);
  if (failed) return <ErrorState error={failed.error} onRetry={() => void failed.refetch()} />;

  return (
    <DeliveryForm
      // A fresh form after each save, so the draft starts from what the server stored.
      key={prefs.dataUpdatedAt}
      initial={prefs.data as NotificationPreferences}
      policy={policy.data as NotificationPolicy}
      contacts={contacts.data ?? []}
      onOpenTab={onOpenTab}
    />
  );
}

function DeliveryForm({
  initial,
  policy,
  contacts,
  onOpenTab,
}: {
  initial: NotificationPreferences;
  policy: NotificationPolicy;
  contacts: Contact[];
  onOpenTab: (tab: string) => void;
}) {
  const locale = useLocale();
  const update = useUpdatePreferences();
  const [draft, setDraft] = useState(initial);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const clock = localClock(locale.timezone);
  const ctx: DeliveryContext = {
    preferences: draft,
    policy,
    contacts,
    localMinutes: clock.minutes,
    weekday: clock.weekday,
    session: DEFAULT_SESSION_HOURS,
  };
  const quietNow = isQuietNow(ctx);
  const escalation = planEscalation('critical', ctx);

  const set = <K extends keyof NotificationPreferences>(
    key: K,
    value: NotificationPreferences[K],
  ) => setDraft((d) => ({ ...d, [key]: value }));

  const toggleChannel = (urgency: Urgency, channel: DeliveryChannel) =>
    setDraft((d) => {
      const current = d.routing[urgency];
      const next = current.includes(channel)
        ? current.filter((c) => c !== channel)
        : [...current, channel];
      return { ...d, routing: { ...d.routing, [urgency]: next } };
    });

  const unverified = [
    ...new Set(
      URGENCIES.flatMap((u) => draft.routing[u]).filter(
        (c) =>
          isContactChannel(c) &&
          policy.allowedChannels.includes(c) &&
          !contacts.some((x) => x.channel === c),
      ),
    ),
  ];

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-6">
        <div
          role="status"
          className={cn(
            'flex items-start gap-3 rounded-xl border px-4 py-3 text-[13px]',
            quietNow ? 'border-warning/30 bg-warning/10' : 'border-line bg-surface-2/60',
          )}
        >
          {quietNow ? (
            <Moon className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          ) : (
            <Sun className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          )}
          <p className="text-fg-muted">
            <span className="font-medium text-fg">
              {quietNow
                ? 'Quiet hours are on right now.'
                : 'Messages go out straight away right now.'}
            </span>{' '}
            {quietNow
              ? draft.quietHours.allowCritical
                ? 'Messages outside the app wait until quiet hours end, except critical alerts.'
                : 'Messages outside the app wait until quiet hours end, including critical alerts.'
              : 'Everything you see in the app also goes to the channels below.'}
          </p>
        </div>

        <Section
          title="Where each urgency goes"
          description="Every notification appears in the app. Pick where else each urgency reaches you."
        >
          <div className="space-y-3">
            {URGENCIES.map((urgency) => (
              <UrgencyRow
                key={urgency}
                urgency={urgency}
                selected={draft.routing[urgency]}
                policy={policy}
                contacts={contacts}
                plan={planDeliveries(urgency, ctx)}
                onToggle={(channel) => toggleChannel(urgency, channel)}
              />
            ))}
          </div>
          {unverified.length > 0 ? (
            <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-fg-muted">
              {unverified.map((c) => CHANNEL_LABELS[c]).join(', ')}{' '}
              {unverified.length === 1 ? 'needs' : 'need'} a verified address before anything is
              sent.
              <Button variant="link" size="sm" onClick={() => onOpenTab('contacts')}>
                Add contacts
              </Button>
            </p>
          ) : null}
        </Section>

        <Section
          title="Quiet hours"
          description="When quiet, messages outside the app wait. The app still shows everything as it happens."
        >
          <fieldset>
            <legend className="sr-only">When quiet hours apply</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              <RadioCard
                name="quiet-mode"
                checked={draft.quietHours.mode === 'off'}
                onChange={() => set('quietHours', { ...draft.quietHours, mode: 'off' })}
                title="No quiet hours"
                detail="Send at any time"
              />
              <RadioCard
                name="quiet-mode"
                checked={draft.quietHours.mode === 'outside-session'}
                onChange={() => set('quietHours', { ...draft.quietHours, mode: 'outside-session' })}
                title="Outside my session"
                detail={`Your session runs ${DEFAULT_SESSION_HOURS.start} to ${DEFAULT_SESSION_HOURS.end}`}
              />
              <RadioCard
                name="quiet-mode"
                checked={draft.quietHours.mode === 'custom'}
                onChange={() => set('quietHours', { ...draft.quietHours, mode: 'custom' })}
                title="Set times"
                detail="Choose a start and end"
              />
            </div>
          </fieldset>
          {draft.quietHours.mode === 'custom' ? (
            <div className="mt-4 grid max-w-sm grid-cols-2 gap-3">
              <Field label="Quiet from">
                {(p) => (
                  <Input
                    {...p}
                    type="time"
                    value={draft.quietHours.start}
                    onChange={(e) =>
                      set('quietHours', { ...draft.quietHours, start: e.target.value })
                    }
                  />
                )}
              </Field>
              <Field label="Until">
                {(p) => (
                  <Input
                    {...p}
                    type="time"
                    value={draft.quietHours.end}
                    onChange={(e) =>
                      set('quietHours', { ...draft.quietHours, end: e.target.value })
                    }
                  />
                )}
              </Field>
            </div>
          ) : null}
          <div className="mt-4 divide-y divide-line rounded-xl border border-line">
            <SwitchRow
              label="Weekends are quiet"
              detail="Saturday and Sunday, all day."
              checked={draft.quietHours.weekends}
              disabled={draft.quietHours.mode === 'off'}
              onChange={(v) => set('quietHours', { ...draft.quietHours, weekends: v })}
            />
            <SwitchRow
              label="Critical alerts still come through"
              detail="For example a limit at 95% or a source down during your session."
              checked={draft.quietHours.allowCritical}
              disabled={draft.quietHours.mode === 'off'}
              onChange={(v) => set('quietHours', { ...draft.quietHours, allowCritical: v })}
            />
          </div>
        </Section>

        <Section
          title="Daily summary"
          description="Info messages for email, WhatsApp, Teams and text are bundled into one summary instead of arriving one by one."
        >
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex items-center gap-3">
              <Switch
                label="Send a daily summary"
                checked={draft.digest.enabled}
                onCheckedChange={(v) => set('digest', { ...draft.digest, enabled: v })}
              />
              <span className="text-[13px] text-fg">Send a daily summary</span>
            </div>
            <Field label="At" className="w-32">
              {(p) => (
                <Input
                  {...p}
                  type="time"
                  value={draft.digest.time}
                  disabled={!draft.digest.enabled}
                  onChange={(e) => set('digest', { ...draft.digest, time: e.target.value })}
                />
              )}
            </Field>
          </div>
        </Section>

        <Section
          title="If nobody acknowledges a critical alert"
          description="Acknowledging in the app, or from a push notification, stops the escalation."
        >
          <div className="divide-y divide-line rounded-xl border border-line">
            <SwitchRow
              label="Escalate unacknowledged critical alerts"
              detail="Repeat the alert on every channel you have verified."
              checked={draft.escalation.enabled}
              onChange={(v) => set('escalation', { ...draft.escalation, enabled: v })}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <label htmlFor="escalate-after" className="text-[13px] text-fg">
                Wait before escalating
              </label>
              <div className="w-40">
                <Select
                  id="escalate-after"
                  value={draft.escalation.afterMinutes}
                  disabled={!draft.escalation.enabled}
                  onChange={(e) =>
                    set('escalation', {
                      ...draft.escalation,
                      afterMinutes: Number(e.target.value),
                    })
                  }
                >
                  {ESCALATION_MINUTES.map((m) => (
                    <option key={m} value={m}>
                      {m} minutes
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <SwitchRow
              label={`Also tell ${policy.supervisorLabel}`}
              detail={
                policy.allowSupervisorEscalation
                  ? 'They see the alert title and reference, so someone can check in with you.'
                  : 'Your firm has turned this off.'
              }
              checked={draft.escalation.notifySupervisor && policy.allowSupervisorEscalation}
              disabled={!draft.escalation.enabled || !policy.allowSupervisorEscalation}
              onChange={(v) => set('escalation', { ...draft.escalation, notifySupervisor: v })}
            />
          </div>
          <p className="mt-3 text-[13px] text-fg-muted">
            {escalation
              ? `After ${escalation.afterMinutes} minutes without acknowledgement, it goes to: ${escalation.target}.`
              : 'Critical alerts are not escalated.'}
          </p>
        </Section>

        <Section
          title="What messages outside the app say"
          description="Lock screens and shared inboxes can be seen by others. Minimal wording keeps figures and names inside the app."
        >
          <fieldset>
            <legend className="sr-only">Wording outside the app</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <RadioCard
                name="privacy"
                checked={draft.privacy === 'minimal'}
                onChange={() => set('privacy', 'minimal')}
                title="Minimal"
                detail="Says only that something is waiting, with a reference."
              />
              <RadioCard
                name="privacy"
                checked={draft.privacy === 'standard'}
                onChange={() => set('privacy', 'standard')}
                disabled={policy.requireMinimalContent}
                title="Standard"
                detail={
                  policy.requireMinimalContent
                    ? 'Your firm requires minimal wording.'
                    : 'Includes the alert’s title and figures.'
                }
              />
            </div>
          </fieldset>
        </Section>

        {dirty ? (
          <div className="sticky bottom-24 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line-strong bg-surface/95 px-4 py-3 shadow-lg backdrop-blur lg:bottom-4">
            <p className="text-[13px] text-fg-muted">You have unsaved changes.</p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDraft(initial)}>
                Discard
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={update.isPending}
                onClick={() => update.mutate(draft)}
              >
                Save changes
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <PreviewPanel draft={draft} contacts={contacts} dirty={dirty} />
    </div>
  );
}

function UrgencyRow({
  urgency,
  selected,
  policy,
  contacts,
  plan,
  onToggle,
}: {
  urgency: Urgency;
  selected: DeliveryChannel[];
  policy: NotificationPolicy;
  contacts: Contact[];
  plan: PlannedDelivery[];
  onToggle: (channel: DeliveryChannel) => void;
}) {
  const meta = URGENCY_META[urgency];
  const { label, examples } = URGENCY_LABELS[urgency];
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Badge tone={meta.tone}>
          <meta.icon aria-hidden /> {label}
        </Badge>
        <span className="text-[13px] text-fg-subtle">{examples}</span>
      </div>
      <div
        role="group"
        aria-label={`Channels for ${label.toLowerCase()} notifications`}
        className="mt-3 flex flex-wrap gap-2"
      >
        {DELIVERY_CHANNELS.map((channel) => {
          const Icon = CHANNEL_ICONS[channel];
          const locked = channel === 'in-app';
          const blocked = !locked && !policy.allowedChannels.includes(channel);
          const needsContact =
            isContactChannel(channel) && !contacts.some((c) => c.channel === channel);
          const on = locked || (!blocked && selected.includes(channel));
          return (
            <button
              key={channel}
              type="button"
              aria-pressed={on}
              disabled={locked || blocked}
              onClick={() => onToggle(channel)}
              title={
                locked
                  ? 'Always on'
                  : blocked
                    ? 'Turned off by your firm'
                    : needsContact
                      ? 'Not verified yet'
                      : undefined
              }
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors',
                on
                  ? 'border-brand-fg/45 bg-brand/12 text-fg'
                  : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
                locked && 'cursor-default',
                blocked && 'cursor-not-allowed line-through opacity-50',
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              {CHANNEL_LABELS[channel]}
              {on && !locked ? <Check className="size-3.5 text-brand-fg" aria-hidden /> : null}
              {blocked ? <span className="sr-only">(turned off by your firm)</span> : null}
              {needsContact && !blocked ? (
                <span className="text-[11px] font-normal text-fg-subtle">· verify</span>
              ) : null}
            </button>
          );
        })}
      </div>
      <PlanLine plan={plan} />
    </div>
  );
}

const PLAN_STATUS = {
  send: { icon: Check, label: 'sent', className: 'text-success' },
  held: { icon: Clock, label: 'held', className: 'text-warning' },
  skipped: { icon: CircleSlash, label: 'skipped', className: 'text-fg-subtle' },
} as const;

/** What would happen to a notification of this urgency if it arrived right now. */
function PlanLine({ plan }: { plan: PlannedDelivery[] }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 text-[12px]">
      <span className="text-fg-subtle">If one arrived now:</span>
      {plan.map((p) => {
        const status = PLAN_STATUS[p.status];
        return (
          <span key={p.channel} className="inline-flex items-center gap-1" title={p.note}>
            <status.icon className={cn('size-3.5', status.className)} aria-hidden />
            <span className="text-fg-muted">
              {CHANNEL_LABELS[p.channel]} {status.label}
              {p.note ? <span className="sr-only"> ({p.note})</span> : null}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function PreviewPanel({
  draft,
  contacts,
  dirty,
}: {
  draft: NotificationPreferences;
  contacts: Contact[];
  dirty: boolean;
}) {
  const { tenant } = useTenant();
  const sendTest = useSendTest();
  const [urgency, setUrgency] = useState<Urgency>('important');
  const [channel, setChannel] = useState<DeliveryChannel>('push');
  const message = renderMessage(SAMPLES[urgency], channel, {
    productName: tenant.productName,
    privacy: draft.privacy,
  });
  const to = isContactChannel(channel)
    ? contacts.find((c) => c.channel === channel)?.address
    : undefined;
  const chosen = channel === 'in-app' || draft.routing[urgency].includes(channel);

  return (
    <Card className="xl:sticky xl:top-24">
      <CardHeader>
        <div>
          <CardTitle>Preview</CardTitle>
          <CardDescription>
            Exactly what arrives, with your current wording setting.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Segmented
          label="Urgency to preview"
          value={urgency}
          options={URGENCIES.map((u) => ({ value: u, label: URGENCY_LABELS[u].label }))}
          onChange={setUrgency}
        />
        <div role="group" aria-label="Channel to preview" className="flex flex-wrap gap-1.5">
          {DELIVERY_CHANNELS.map((c) => {
            const Icon = CHANNEL_ICONS[c];
            return (
              <button
                key={c}
                type="button"
                aria-pressed={channel === c}
                onClick={() => setChannel(c)}
                className={cn(
                  'inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[12px] transition-colors',
                  channel === c
                    ? 'border-brand-fg/45 bg-brand/12 text-fg'
                    : 'border-line text-fg-muted hover:text-fg',
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {CHANNEL_LABELS[c]}
              </button>
            );
          })}
        </div>
        <MessagePreview message={message} to={to} />
        {!chosen ? (
          <p className="text-[12px] text-fg-subtle">
            {CHANNEL_LABELS[channel]} is not chosen for{' '}
            {URGENCY_LABELS[urgency].label.toLowerCase()} notifications, so this is how it would
            look if you turned it on.
          </p>
        ) : null}
        <div className="border-t border-line pt-4">
          <Button
            className="w-full"
            loading={sendTest.isPending}
            disabled={dirty}
            onClick={() => sendTest.mutate(urgency)}
          >
            <Send aria-hidden /> Send a test {URGENCY_LABELS[urgency].label.toLowerCase()}{' '}
            notification
          </Button>
          <p className="mt-2 text-[12px] text-fg-subtle">
            {dirty
              ? 'Save your changes first. Tests use your saved settings.'
              : 'It goes through your saved settings and appears in the delivery log.'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function RadioCard({
  name,
  checked,
  onChange,
  title,
  detail,
  disabled,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  detail: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-x-3 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-brand/25',
        checked ? 'border-brand-fg/50 bg-brand/8' : 'border-line hover:border-line-strong',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="row-span-2 mt-0.5 size-4 shrink-0 accent-brand"
      />
      <span className="text-[13px] font-medium text-fg">{title}</span>
      <span className="mt-0.5 text-[12px] leading-snug text-fg-subtle">{detail}</span>
    </label>
  );
}

function SwitchRow({
  label,
  detail,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div
      className={cn('flex items-center justify-between gap-4 px-4 py-3', disabled && 'opacity-60')}
    >
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-fg">{label}</p>
        <p className="mt-0.5 text-[12px] leading-snug text-fg-subtle">{detail}</p>
      </div>
      <Switch label={label} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="grid grid-cols-3 gap-1 rounded-lg bg-surface-2 p-1"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-8 rounded-md text-[12px] font-medium transition-colors',
            value === o.value ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
