import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { formatDateTime, formatRelative, type AuditEvent } from '@twindesk/core';
import { useLocale } from '@/shared/hooks/use-locale';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Tooltip } from '@/shared/ui/menu';
import { toast } from '@/shared/ui/toast';
import {
  ACTION_LABELS,
  actorRoleLabel,
  actorRoleTone,
  OUTCOME_LABEL,
  OUTCOME_TONE,
} from './audit-labels';

function CopyRef({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy', 'Your browser blocked access to the clipboard.');
    }
  };
  return (
    <span className="inline-flex items-center gap-1">
      <code className="font-mono text-[12px] text-fg-muted">{value}</code>
      <Tooltip content={copied ? 'Copied' : 'Copy reference'}>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-7"
          onClick={() => void copy()}
          aria-label={`Copy reference ${value}`}
        >
          {copied ? <Check className="text-success" /> : <Copy />}
        </Button>
      </Tooltip>
    </span>
  );
}

function Actor({ event }: { event: AuditEvent }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="truncate text-[13px] font-medium text-fg">{event.actor.name}</span>
      <Badge tone={actorRoleTone(event.actor.role)}>{actorRoleLabel(event.actor.role)}</Badge>
    </span>
  );
}

export function AuditList({ items }: { items: AuditEvent[] }) {
  const locale = useLocale();

  return (
    <>
      {/* Wide screens: a scannable table. */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Audit records, newest first</caption>
          <thead>
            <tr className="border-b border-line text-[11px] tracking-[0.12em] text-fg-subtle uppercase">
              <th scope="col" className="px-5 py-2.5 font-mono font-medium">
                Time
              </th>
              <th scope="col" className="px-3 py-2.5 font-mono font-medium">
                Actor
              </th>
              <th scope="col" className="px-3 py-2.5 font-mono font-medium">
                Action
              </th>
              <th scope="col" className="px-3 py-2.5 font-mono font-medium">
                Outcome
              </th>
              <th scope="col" className="px-3 py-2.5 font-mono font-medium">
                Summary
              </th>
              <th scope="col" className="px-5 py-2.5 font-mono font-medium">
                Reference
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((e) => (
              <tr
                key={e.id}
                className="border-b border-line/70 align-top transition-colors last:border-0 hover:bg-surface-2/50"
              >
                <td className="px-5 py-3 whitespace-nowrap">
                  <time dateTime={e.at} className="block font-mono text-[12px] text-fg tabular">
                    {formatDateTime(e.at, locale)}
                  </time>
                  <span className="text-[11px] text-fg-subtle">{formatRelative(e.at, locale)}</span>
                </td>
                <td className="max-w-48 px-3 py-3">
                  <Actor event={e} />
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <span className="block text-[13px] text-fg">{ACTION_LABELS[e.action]}</span>
                  <code className="mt-1 inline-block rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[11.5px] text-fg-muted">
                    {e.action}
                  </code>
                </td>
                <td className="px-3 py-3">
                  <Badge tone={OUTCOME_TONE[e.outcome]}>{OUTCOME_LABEL[e.outcome]}</Badge>
                </td>
                <td className="min-w-72 px-3 py-3 text-[13px] leading-relaxed text-fg-muted">
                  {e.summary}
                </td>
                <td className="px-5 py-2 whitespace-nowrap">
                  {e.ref ? <CopyRef value={e.ref} /> : <span className="text-fg-subtle">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phones and tablets: one card per record. */}
      <ul className="divide-y divide-line lg:hidden">
        {items.map((e) => (
          <li key={e.id} className="flex flex-col gap-2 px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <Actor event={e} />
              <Badge tone={OUTCOME_TONE[e.outcome]}>{OUTCOME_LABEL[e.outcome]}</Badge>
            </div>
            <p className="text-[13px] leading-relaxed text-fg-muted">{e.summary}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-fg-subtle">
              <time dateTime={e.at} className="font-mono tabular">
                {formatDateTime(e.at, locale)}
              </time>
              <span className="text-fg-muted">{ACTION_LABELS[e.action]}</span>
              <code className="font-mono">{e.action}</code>
              {e.ref ? <CopyRef value={e.ref} /> : null}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
