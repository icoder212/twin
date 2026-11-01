import { Send, Sunrise, Sunset } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import {
  ApiError,
  BRIEFING_META,
  BRIEFING_SECTION_LABELS,
  CHANNEL_LABELS,
  DELIVERY_CHANNELS,
  formatDateTime,
  formatRelative,
  isContactChannel,
  type BriefingSchedule,
  type Contact,
  type DeliveryChannel,
  type NotificationPolicy,
  type UpdateBriefingInput,
} from '@twindesk/core';
import { cn } from '@/lib/cn';
import { useLocale } from '@/shared/hooks/use-locale';
import { Button } from '@/shared/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card';
import { ToneIcon } from '@/shared/ui/feedback';
import { Checkbox, Field, Input, Switch } from '@/shared/ui/field';
import { BriefingPreview } from './BriefingPreview';
import { CHANNEL_ICONS, WEEKDAYS } from './notify-meta';
import { useSendBriefing, useUpdateBriefing } from './queries';

type Draft = Omit<UpdateBriefingInput, 'kind'>;
type Availability = 'always' | 'firm-off' | 'verify' | 'available';

function availability(
  channel: DeliveryChannel,
  policy: NotificationPolicy,
  contacts: Contact[],
): Availability {
  if (channel === 'in-app') return 'always';
  if (!policy.allowedChannels.includes(channel)) return 'firm-off';
  if (isContactChannel(channel) && !contacts.some((c) => c.channel === channel)) return 'verify';
  return 'available';
}

/** The saved schedule as a draft, keeping only channels that can be used today. */
function toDraft(schedule: BriefingSchedule, usable: (c: DeliveryChannel) => boolean): Draft {
  return {
    enabled: schedule.enabled,
    time: schedule.time,
    days: [...schedule.days].sort((a, b) => a - b),
    channels: DELIVERY_CHANNELS.filter(
      (c) => c === 'in-app' || (schedule.channels.includes(c) && usable(c)),
    ),
    sections: schedule.sections,
  };
}

function toggle<T>(list: readonly T[], value: T, on: boolean): T[] {
  return on ? [...list.filter((v) => v !== value), value] : list.filter((v) => v !== value);
}

export function BriefingCard({
  schedule,
  policy,
  contacts,
}: {
  schedule: BriefingSchedule;
  policy: NotificationPolicy;
  contacts: Contact[];
}) {
  const locale = useLocale();
  const meta = BRIEFING_META[schedule.kind];
  const update = useUpdateBriefing();
  const send = useSendBriefing();
  const usable = (c: DeliveryChannel) => {
    const a = availability(c, policy, contacts);
    return a === 'always' || a === 'available';
  };
  const saved = toDraft(schedule, usable);
  const [draft, setDraft] = useState<Draft>(saved);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = JSON.stringify(normalise(draft)) !== JSON.stringify(normalise(saved));
  const id = schedule.kind;

  const patch = (next: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...next }));
    setErrors({});
  };

  const save = () =>
    update.mutate(
      { kind: schedule.kind, ...normalise(draft) },
      {
        onError: (error) => setErrors(error instanceof ApiError ? (error.fieldErrors ?? {}) : {}),
      },
    );

  return (
    <Card aria-labelledby={`${id}-title`}>
      <CardHeader>
        <div className="flex min-w-0 items-start gap-3">
          <ToneIcon icon={schedule.kind === 'morning-brief' ? Sunrise : Sunset} tone="brand" />
          <div className="min-w-0">
            <CardTitle id={`${id}-title`}>{meta.title}</CardTitle>
            <CardDescription>{meta.description}</CardDescription>
          </div>
        </div>
        <Switch
          checked={draft.enabled}
          onCheckedChange={(enabled) => patch({ enabled })}
          label={`Send the ${meta.title.toLowerCase()}`}
        />
      </CardHeader>

      <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <div className="grid gap-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
            <Field label="Time" hint="24-hour, your time zone" error={errors.time}>
              {(p) => (
                <Input
                  {...p}
                  type="time"
                  step={60}
                  required
                  value={draft.time}
                  onChange={(e) => patch({ time: e.target.value })}
                />
              )}
            </Field>
            <fieldset className="min-w-0">
              <legend className="mb-1.5 text-[13px] font-medium text-fg">Days</legend>
              <div className="flex flex-wrap gap-1 sm:gap-1.5">
                {WEEKDAYS.map(({ day, short, long }) => {
                  const on = draft.days.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={on}
                      aria-label={long}
                      onClick={() => patch({ days: toggle(draft.days, day, !on) })}
                      className={cn(
                        'h-8 min-w-9 rounded-md border px-1.5 text-[12px] font-medium transition-colors sm:min-w-10 sm:px-2',
                        on
                          ? 'border-brand-fg/40 bg-brand/15 text-brand-fg'
                          : 'border-line bg-surface-2 text-fg-muted hover:border-line-strong',
                      )}
                    >
                      {short}
                    </button>
                  );
                })}
              </div>
              {errors.days ? (
                <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
                  {errors.days}
                </p>
              ) : null}
            </fieldset>
          </div>

          <fieldset className="min-w-0">
            <legend className="mb-1.5 text-[13px] font-medium text-fg">Send to</legend>
            <ul className="grid gap-2 sm:grid-cols-2">
              {DELIVERY_CHANNELS.map((channel) => {
                const state = availability(channel, policy, contacts);
                const Icon = CHANNEL_ICONS[channel];
                const inputId = `${id}-channel-${channel}`;
                const locked = state !== 'available';
                return (
                  <li
                    key={channel}
                    className={cn(
                      'flex min-h-10 items-center gap-2.5 rounded-lg border border-line px-3 py-2',
                      (state === 'firm-off' || state === 'verify') && 'bg-surface-2/50',
                    )}
                  >
                    <Checkbox
                      id={inputId}
                      checked={
                        state === 'always' || (usable(channel) && draft.channels.includes(channel))
                      }
                      disabled={locked}
                      onChange={(e) =>
                        patch({ channels: toggle(draft.channels, channel, e.target.checked) })
                      }
                    />
                    <label
                      htmlFor={inputId}
                      className={cn(
                        'flex min-w-0 flex-1 items-center gap-2 text-[13px]',
                        locked && state !== 'always' ? 'text-fg-subtle' : 'text-fg',
                      )}
                    >
                      <Icon className="size-4 shrink-0 text-fg-subtle" aria-hidden />
                      <span className="truncate">{CHANNEL_LABELS[channel]}</span>
                    </label>
                    {state === 'always' ? (
                      <span className="text-[11px] text-fg-subtle">Always</span>
                    ) : state === 'firm-off' ? (
                      <span className="text-[11px] text-fg-subtle">Off for your firm</span>
                    ) : state === 'verify' ? (
                      <Link
                        to="?tab=contacts"
                        className="text-[11px] font-medium whitespace-nowrap text-brand-fg hover:underline"
                        aria-label={`Verify ${CHANNEL_LABELS[channel]} first`}
                      >
                        Verify first
                      </Link>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {errors.channels ? (
              <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
                {errors.channels}
              </p>
            ) : null}
          </fieldset>

          <fieldset className="min-w-0">
            <legend className="mb-1.5 text-[13px] font-medium text-fg">What it covers</legend>
            <ul className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
              {meta.sections.map((section) => {
                const inputId = `${id}-section-${section}`;
                return (
                  <li key={section} className="flex items-center gap-2.5">
                    <Checkbox
                      id={inputId}
                      checked={draft.sections.includes(section)}
                      onChange={(e) =>
                        patch({ sections: toggle(draft.sections, section, e.target.checked) })
                      }
                    />
                    <label htmlFor={inputId} className="text-[13px] text-fg">
                      {BRIEFING_SECTION_LABELS[section]}
                    </label>
                  </li>
                );
              })}
            </ul>
            {errors.sections ? (
              <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
                {errors.sections}
              </p>
            ) : null}
          </fieldset>

          <dl className="grid grid-cols-2 gap-3 rounded-lg border border-line bg-surface-2/40 px-3 py-2.5 text-[12.5px]">
            <div className="min-w-0">
              <dt className="text-fg-subtle">Next</dt>
              <dd className="mt-0.5 font-medium text-fg">
                {schedule.nextRunAt ? (
                  <time
                    dateTime={schedule.nextRunAt}
                    title={formatRelative(schedule.nextRunAt, locale)}
                  >
                    {formatDateTime(schedule.nextRunAt, locale)}
                  </time>
                ) : (
                  'Paused'
                )}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-fg-subtle">Last sent</dt>
              <dd className="mt-0.5 font-medium text-fg">
                {schedule.lastSentAt ? (
                  <time
                    dateTime={schedule.lastSentAt}
                    title={formatRelative(schedule.lastSentAt, locale)}
                  >
                    {formatDateTime(schedule.lastSentAt, locale)}
                  </time>
                ) : (
                  'Not yet'
                )}
              </dd>
            </div>
          </dl>
        </div>

        <BriefingPreview kind={schedule.kind} stale={dirty} />
      </CardContent>

      <CardFooter className="flex-wrap justify-between gap-3">
        <p className="text-xs text-fg-subtle">
          {dirty ? 'You have unsaved changes.' : 'Send now uses your saved settings.'}
        </p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            loading={send.isPending}
            onClick={() => send.mutate(schedule.kind)}
          >
            <Send aria-hidden />
            Send now
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!dirty}
            loading={update.isPending}
            onClick={save}
          >
            Save
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

/** Stable order, so comparing drafts ignores the order things were ticked in. */
function normalise(draft: Draft): Draft {
  return {
    ...draft,
    days: [...draft.days].sort((a, b) => a - b),
    channels: DELIVERY_CHANNELS.filter((c) => draft.channels.includes(c)),
    sections: [...draft.sections].sort(),
  };
}
