import { Building2, CheckCircle2, CircleSlash, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import {
  CHANNEL_LABELS,
  DELIVERY_CHANNELS,
  formatDateTime,
  type DeliveryChannel,
  type NotificationPolicy,
} from '@twindesk/core';
import { useAuth } from '@/features/auth/use-auth';
import { useTenant } from '@/features/tenant/tenant-context';
import { QueryView } from '@/shared/components/QueryView';
import { useLocale } from '@/shared/hooks/use-locale';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/feedback';
import { Switch } from '@/shared/ui/field';
import { CHANNEL_ICONS } from './notify-meta';
import { useNotificationPolicy, useUpdatePolicy } from './queries';

const CHANNEL_NOTES: Partial<Record<DeliveryChannel, string>> = {
  whatsapp:
    'One-way notifications through the WhatsApp Business Platform, from approved templates. Replies are never acted on.',
  sms: 'Short messages, often used as a backup for critical alerts.',
  teams: 'A message from the app in your firm’s Microsoft Teams.',
};

export function FirmPolicyTab() {
  const policy = useNotificationPolicy();
  return (
    <QueryView query={policy} loading={<Skeleton className="h-96 rounded-2xl" />}>
      {(data) => <PolicyForm key={data.updatedAt ?? 'initial'} initial={data} />}
    </QueryView>
  );
}

function PolicyForm({ initial }: { initial: NotificationPolicy }) {
  const { can } = useAuth();
  const { tenant } = useTenant();
  const locale = useLocale();
  const save = useUpdatePolicy();
  const editable = can('tenant.configure');
  const [draft, setDraft] = useState(initial);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const toggle = (channel: DeliveryChannel, on: boolean) =>
    setDraft((d) => ({
      ...d,
      allowedChannels: on
        ? DELIVERY_CHANNELS.filter((c) => c === channel || d.allowedChannels.includes(c))
        : d.allowedChannels.filter((c) => c !== channel),
    }));

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <CardHeader className="flex-col gap-3 sm:flex-row">
          <div className="min-w-0">
            <CardTitle>{tenant.name} notification policy</CardTitle>
            <CardDescription>
              {editable
                ? 'Applies to everyone at the firm. Turning a channel off stops it straight away.'
                : 'Set by your firm’s administrators. It decides which channels you can choose.'}
            </CardDescription>
          </div>
          {initial.updatedAt ? (
            <p className="shrink-0 text-[12px] text-fg-subtle">
              Changed {formatDateTime(initial.updatedAt, locale)}
              {initial.updatedBy ? ` by ${initial.updatedBy}` : ''}
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-6">
          <section aria-labelledby="policy-channels">
            <h3 id="policy-channels" className="text-[13px] font-semibold text-fg">
              Channels people can use
            </h3>
            <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
              {DELIVERY_CHANNELS.map((channel) => {
                const Icon = CHANNEL_ICONS[channel];
                const on = channel === 'in-app' || draft.allowedChannels.includes(channel);
                return (
                  <li key={channel} className="flex items-center gap-3 px-4 py-3">
                    <Icon className="size-4 shrink-0 text-fg-muted" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-fg">{CHANNEL_LABELS[channel]}</p>
                      {channel === 'in-app' ? (
                        <p className="text-[12px] text-fg-subtle">
                          Always on: the record of every notification.
                        </p>
                      ) : CHANNEL_NOTES[channel] ? (
                        <p className="text-[12px] leading-snug text-fg-subtle">
                          {CHANNEL_NOTES[channel]}
                        </p>
                      ) : null}
                    </div>
                    {editable ? (
                      <Switch
                        label={`Allow ${CHANNEL_LABELS[channel]}`}
                        checked={on}
                        disabled={channel === 'in-app'}
                        onCheckedChange={(v) => toggle(channel, v)}
                      />
                    ) : (
                      <AllowedBadge on={on} />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="policy-rules">
            <h3 id="policy-rules" className="text-[13px] font-semibold text-fg">
              Rules for everyone
            </h3>
            <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
              <PolicyRow
                label="Minimal wording outside the app"
                detail="Messages say only that something is waiting. Figures, names and account details stay in the app."
                checked={draft.requireMinimalContent}
                editable={editable}
                onChange={(v) => setDraft((d) => ({ ...d, requireMinimalContent: v }))}
              />
              <PolicyRow
                label={`Escalate to ${draft.supervisorLabel}`}
                detail="People can choose to send unacknowledged critical alerts to this desk as well."
                checked={draft.allowSupervisorEscalation}
                editable={editable}
                onChange={(v) => setDraft((d) => ({ ...d, allowSupervisorEscalation: v }))}
              />
            </ul>
          </section>

          {editable ? (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
              {dirty ? (
                <Button variant="ghost" onClick={() => setDraft(initial)}>
                  Discard
                </Button>
              ) : null}
              <Button
                variant="primary"
                disabled={!dirty}
                loading={save.isPending}
                onClick={() =>
                  save.mutate({
                    allowedChannels: draft.allowedChannels,
                    requireMinimalContent: draft.requireMinimalContent,
                    allowSupervisorEscalation: draft.allowSupervisorEscalation,
                  })
                }
              >
                Save firm policy
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="size-4 text-brand-fg" aria-hidden />
            <CardTitle>Before allowing WhatsApp or texts</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-[13px] leading-relaxed text-fg-muted">
            Regulators expect business communications to be recorded. These keep messaging apps
            inside those rules:
          </p>
          <ul className="mt-3 space-y-3 text-[13px] leading-relaxed text-fg-muted">
            {[
              'Notifications only. Replies and instructions are never acted on.',
              'Sent from templates approved in advance, through the official business platform.',
              'Each person opts in with a verified number, and consent is recorded.',
              'Every message is archived in the delivery log and the audit log.',
              'Minimal wording keeps figures and account details inside the app.',
            ].map((line) => (
              <li key={line} className="flex gap-2">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-fg" aria-hidden />
                {line}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function AllowedBadge({ on, onLabel = 'Allowed' }: { on: boolean; onLabel?: string }) {
  return on ? (
    <Badge tone="success">
      <CheckCircle2 aria-hidden /> {onLabel}
    </Badge>
  ) : (
    <Badge tone="neutral">
      <CircleSlash aria-hidden /> Off
    </Badge>
  );
}

function PolicyRow({
  label,
  detail,
  checked,
  editable,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  editable: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-fg">{label}</p>
        <p className="mt-0.5 text-[12px] leading-snug text-fg-subtle">{detail}</p>
      </div>
      {editable ? (
        <Switch label={label} checked={checked} onCheckedChange={onChange} />
      ) : (
        <AllowedBadge on={checked} onLabel="On" />
      )}
    </li>
  );
}
