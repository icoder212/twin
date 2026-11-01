import { Plug, RefreshCw, TriangleAlert, Unplug } from 'lucide-react';
import { useState } from 'react';
import { formatNumber, formatRelative, type ConnectedSource } from '@twindesk/core';
import { useAuth } from '@/features/auth/use-auth';
import { cn } from '@/lib/cn';
import { useLocale } from '@/shared/hooks/use-locale';
import { Badge, StatusDot } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { ConfirmDialog } from '@/shared/ui/dialog';
import { ToneIcon } from '@/shared/ui/feedback';
import { Tooltip } from '@/shared/ui/menu';
import { useRevokeSource, useSyncSource } from './queries';
import { ACCESS_META, AUTH_LABELS, PROVIDER_ICONS, STATUS_META, isStale } from './source-meta';

export function SourceCard({
  source,
  onConnect,
}: {
  source: ConnectedSource;
  onConnect: (source: ConnectedSource) => void;
}) {
  const locale = useLocale();
  const { can } = useAuth();
  const sync = useSyncSource();
  const revoke = useRevokeSource();
  const [confirming, setConfirming] = useState(false);
  const manage = can('sources.manage');
  const status = STATUS_META[source.status];
  const access = ACCESS_META[source.access];
  const stale = isStale(source);
  const syncing = source.status === 'syncing' || (sync.isPending && sync.variables === source.id);
  const connected = source.status === 'connected' || source.status === 'syncing';

  return (
    <Card
      className={cn(
        'flex h-full flex-col p-4',
        source.status === 'not-connected' && 'bg-surface/60',
      )}
    >
      <div className="flex items-start gap-3">
        <ToneIcon
          icon={PROVIDER_ICONS[source.provider]}
          tone={source.status === 'error' ? 'danger' : connected ? 'brand' : 'neutral'}
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-fg">{source.name}</h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-muted" aria-live="polite">
            <StatusDot tone={syncing ? 'info' : status.tone} pulse={syncing} />
            {syncing ? 'Fetching' : status.label}
            {stale ? (
              <Badge tone="warning" className="ml-1">
                Stale
              </Badge>
            ) : null}
          </p>
        </div>
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-fg-muted">{source.description}</p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Tooltip content={access.explain}>
          <button
            type="button"
            className="rounded-full"
            aria-label={`${access.label}: ${access.explain}`}
          >
            <Badge tone={access.tone}>{access.label}</Badge>
          </button>
        </Tooltip>
        <Badge>{AUTH_LABELS[source.authMethod]}</Badge>
      </div>

      {source.scopes.length ? (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Scopes">
          {source.scopes.map((s) => (
            <li
              key={s}
              className="rounded-md border border-line bg-surface-2/60 px-2 py-0.5 text-[11.5px] text-fg-muted"
            >
              {s}
            </li>
          ))}
        </ul>
      ) : null}

      {source.status === 'error' && source.errorMessage ? (
        <p
          role="alert"
          className="mt-3 flex gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs leading-relaxed text-danger"
        >
          <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          {source.errorMessage}
        </p>
      ) : null}

      <div className="mt-auto pt-4">
        {source.lastSyncAt ? (
          <p className="text-xs text-fg-subtle">
            Last fetch {formatRelative(source.lastSyncAt, locale)}
            {source.recordCount !== undefined
              ? ` · ${formatNumber(source.recordCount, locale)} records`
              : ''}
            {stale ? ' · older than its freshness window' : ''}
          </p>
        ) : (
          <p className="text-xs text-fg-subtle">Not fetched yet</p>
        )}

        {manage ? (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
            {source.status === 'not-connected' ? (
              <Button size="sm" variant="primary" onClick={() => onConnect(source)}>
                <Plug aria-hidden /> Connect
              </Button>
            ) : null}
            {source.status === 'error' ? (
              <Button size="sm" variant="primary" onClick={() => onConnect(source)}>
                <Plug aria-hidden /> Reconnect
              </Button>
            ) : null}
            {connected ? (
              <Button size="sm" loading={syncing} onClick={() => sync.mutate(source.id)}>
                {syncing ? null : <RefreshCw aria-hidden />} Fetch now
              </Button>
            ) : null}
            {source.status !== 'not-connected' ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-danger hover:text-danger"
                onClick={() => setConfirming(true)}
              >
                <Unplug aria-hidden /> Revoke
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Revoke access to ${source.name}?`}
        description="The twin stops fetching from this source straight away and the key is deleted from the vault. Records already fetched stay cited in past answers. You can reconnect at any time."
        confirmLabel="Revoke access"
        loading={revoke.isPending}
        onConfirm={() => revoke.mutate(source.id, { onSuccess: () => setConfirming(false) })}
      />
    </Card>
  );
}
