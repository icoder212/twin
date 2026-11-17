import { Wallet } from 'lucide-react';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { CHANNEL_LABELS, MAX_WHATSAPP_MONTHLY_CAP, type Usage } from '@twindesk/core';
import { toastError } from '@/lib/mutation';
import { QueryView } from '@/shared/components/QueryView';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/feedback';
import { Input } from '@/shared/ui/field';
import { useRealAccount } from './real-account';
import { useSaveUsageCap, useUsage } from './watch-queries';

function money(value: number, currency: string | null): string {
  return currency
    ? new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(value)
    : value.toFixed(2);
}

/**
 * On the Notifications page, with the real account: what alerts have sent this month on each
 * channel, what WhatsApp has cost at Twilio, and a monthly cap on WhatsApp messages.
 */
export function UsageCard() {
  const signedIn = useRealAccount((s) => s.status.signedIn);
  const usage = useUsage();
  if (!signedIn) return null;
  return (
    <Card aria-labelledby="usage-title">
      <CardHeader>
        <div>
          <CardTitle id="usage-title" className="flex items-center gap-2">
            <Wallet className="size-4 text-brand-fg" aria-hidden /> Messages and spend
          </CardTitle>
          <CardDescription>
            What your alerts have sent this month, and what WhatsApp has cost. Set a monthly cap and
            WhatsApp stops there; the app and email carry on.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <QueryView query={usage} loading={<Skeleton className="h-32 rounded-xl" />}>
          {(data) => <UsageView usage={data} />}
        </QueryView>
      </CardContent>
    </Card>
  );
}

function UsageView({ usage }: { usage: Usage }) {
  const { whatsapp } = usage;
  const share = whatsapp.cap ? Math.min(100, (whatsapp.sent / whatsapp.cap) * 100) : null;
  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure label={`WhatsApp in ${usage.month}`}>
          {whatsapp.sent}
          {whatsapp.cap ? <span className="text-fg-subtle"> of {whatsapp.cap}</span> : null}
        </Figure>
        <Figure label="Spent this month">
          {whatsapp.spent === null ? '–' : money(whatsapp.spent, whatsapp.currency)}
        </Figure>
        <Figure label="Twilio balance">
          {whatsapp.balance === null ? '–' : money(whatsapp.balance, whatsapp.currency)}
        </Figure>
        <Figure label="Sending stops at">
          {whatsapp.floor === null ? '–' : money(whatsapp.floor, whatsapp.currency)}
        </Figure>
      </dl>

      {share !== null ? (
        <div
          role="meter"
          aria-label="WhatsApp messages used of this month’s cap"
          aria-valuemin={0}
          aria-valuemax={whatsapp.cap ?? 0}
          aria-valuenow={whatsapp.sent}
          className="h-1.5 overflow-hidden rounded-full bg-surface-2"
        >
          <div
            className={share >= 90 ? 'h-full bg-warning' : 'h-full bg-brand-fg'}
            style={{ width: `${share}%` }}
          />
        </div>
      ) : null}

      {usage.channels.length > 0 ? (
        <ul className="divide-y divide-line rounded-xl border border-line" aria-label="By channel">
          {usage.channels.map((c) => (
            <li key={c.channel} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
              <span className="flex-1 text-fg">{CHANNEL_LABELS[c.channel]}</span>
              <span className="font-mono text-fg">{c.sent} sent</span>
              {c.failed > 0 ? (
                <span className="font-mono text-danger">{c.failed} failed</span>
              ) : null}
              {c.skipped > 0 ? (
                <span className="font-mono text-fg-subtle">{c.skipped} not sent</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-fg-subtle">Nothing sent yet this month.</p>
      )}

      <CapForm cap={whatsapp.cap} />
    </div>
  );
}

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line px-3 py-2.5">
      <dt className="text-[11px] text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 font-mono text-[15px] text-fg">{children}</dd>
    </div>
  );
}

function CapForm({ cap }: { cap: number | null }) {
  const inputId = useId();
  const save = useSaveUsageCap();
  const [text, setText] = useState(cap === null ? '' : String(cap));
  const value = Number(text.trim());
  const valid =
    text.trim() !== '' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_WHATSAPP_MONTHLY_CAP;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    save.mutate({ whatsappCap: value }, { onError: toastError('Could not save the cap') });
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
      <div className="space-y-1.5">
        <label htmlFor={inputId} className="text-[13px] font-medium text-fg">
          WhatsApp messages a month, at most
        </label>
        <Input
          id={inputId}
          inputMode="numeric"
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="No cap"
          className="w-36 font-mono"
        />
      </div>
      <Button type="submit" size="sm" disabled={!valid || save.isPending || value === cap}>
        Save cap
      </Button>
      {cap !== null ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={save.isPending}
          onClick={() =>
            save.mutate(
              { whatsappCap: null },
              { onError: toastError('Could not remove the cap'), onSuccess: () => setText('') },
            )
          }
        >
          Remove cap
        </Button>
      ) : null}
    </form>
  );
}
