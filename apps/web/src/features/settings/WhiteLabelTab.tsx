import { Check, Clock, KeyRound } from 'lucide-react';
import { useState } from 'react';
import {
  FEATURE_KEYS,
  TENANT_PRESETS,
  safeUrl,
  type TenantConfig,
  type ThemeTokens,
} from '@twindesk/core';
import { useAuth } from '@/features/auth/use-auth';
import { useTenant } from '@/features/tenant/tenant-context';
import { cn } from '@/lib/cn';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { ConfirmDialog } from '@/shared/ui/dialog';
import { EmbedPreview } from './EmbedPreview';
import { SettingSection } from './SettingSection';

const FEATURE_LABELS: Record<(typeof FEATURE_KEYS)[number], string> = {
  twin: 'Twin',
  tasks: 'Tasks',
  workflows: 'Workflows',
  shortcuts: 'Shortcuts',
  alerts: 'Alerts',
  approvals: 'Approvals',
  sources: 'Sources',
  audit: 'Audit',
};

const SSO_LABELS = { microsoft: 'Microsoft', google: 'Google', saml: 'SAML' } as const;

function Swatches({ label, tokens }: { label: string; tokens: ThemeTokens }) {
  const swatches: Array<[string, string]> = [
    ['Background', tokens.bg],
    ['Surface', tokens.surface],
    ['Brand', tokens.brand],
    ['Accent', tokens.accent],
  ];
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 shrink-0 font-mono text-[10px] tracking-[0.12em] text-fg-subtle uppercase">
        {label}
      </span>
      <span className="flex overflow-hidden rounded-md border border-line">
        {swatches.map(([name, color]) => (
          <span
            key={name}
            title={`${name} ${color}`}
            className="size-6"
            style={{ backgroundColor: color }}
          >
            <span className="sr-only">
              {name} {color}
            </span>
          </span>
        ))}
      </span>
    </div>
  );
}

function TenantCard({
  preset,
  active,
  onSwitch,
}: {
  preset: TenantConfig;
  active: boolean;
  onSwitch: () => void;
}) {
  const enabled = FEATURE_KEYS.filter((f) => preset.features[f]);
  // The card header is drawn in the preset's dark colours, so it takes the dark-background logo.
  const logoUrl = preset.brand.logo ? safeUrl(preset.brand.logo.onDark) : null;
  return (
    <Card className={cn('flex flex-col overflow-hidden', active && 'border-brand-fg/50')}>
      <div className="relative h-20 px-4 py-3" style={{ backgroundColor: preset.theme.dark.bg }}>
        <div
          aria-hidden
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage: `radial-gradient(70% 90% at 15% 0%, ${preset.theme.dark.brand}, transparent 70%)`,
          }}
        />
        <div className="relative flex items-start justify-between gap-2">
          {logoUrl && preset.brand.logo ? (
            <img
              src={logoUrl}
              alt={`${preset.brand.wordmark}${preset.brand.wordmarkAccent ?? ''}`}
              width={Math.round(24 * preset.brand.logo.aspectRatio)}
              height={24}
              className="my-0.5 h-6 w-auto"
              decoding="async"
            />
          ) : (
            <p
              className="text-lg font-semibold tracking-tight"
              style={{ color: preset.theme.dark.fg }}
            >
              {preset.brand.wordmark}
              {preset.brand.wordmarkAccent ? (
                <span style={{ color: preset.theme.dark.accent }}>
                  {preset.brand.wordmarkAccent}
                </span>
              ) : null}
            </p>
          )}
          {active ? (
            <Badge tone="success">
              <Check aria-hidden /> Active
            </Badge>
          ) : null}
        </div>
        <p
          className="relative mt-1 font-mono text-[10px] tracking-[0.16em] uppercase"
          style={{ color: preset.theme.dark.fgMuted }}
        >
          {preset.productName}
        </p>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="text-[13.5px] font-semibold text-fg">{preset.name}</p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-fg-muted">{preset.tagline}</p>
        </div>
        <div className="space-y-1.5">
          <Swatches label="Dark" tokens={preset.theme.dark} />
          <Swatches label="Light" tokens={preset.theme.light} />
        </div>
        <div className="flex flex-wrap gap-1">
          {enabled.map((f) => (
            <Badge key={f} tone="neutral">
              {FEATURE_LABELS[f]}
            </Badge>
          ))}
        </div>
        <ul className="space-y-1 text-[12px] text-fg-muted">
          <li className="flex items-center gap-1.5">
            <Clock className="size-3.5 text-fg-subtle" aria-hidden /> Idle sign-out after{' '}
            {preset.security.idleTimeoutMinutes} minutes
          </li>
          <li className="flex items-center gap-1.5">
            <KeyRound className="size-3.5 text-fg-subtle" aria-hidden />
            {preset.security.mfaRequired
              ? 'Two-step verification required'
              : 'Two-step verification optional'}{' '}
            · SSO: {preset.security.ssoProviders.map((p) => SSO_LABELS[p]).join(', ') || 'none'}
          </li>
          <li className="pl-5 text-fg-subtle">
            {preset.locale.currency} ·{' '}
            {preset.theme.defaultScheme === 'system'
              ? 'matches device'
              : `${preset.theme.defaultScheme} by default`}
          </li>
        </ul>
        <div className="mt-auto pt-1">
          <Button
            variant={active ? 'secondary' : 'primary'}
            size="sm"
            className="w-full"
            disabled={active}
            onClick={onSwitch}
          >
            {active ? 'Current brand' : 'Switch to this brand'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function WhiteLabelTab() {
  const { tenant, switchTenant } = useTenant();
  const { signOut } = useAuth();
  const [target, setTarget] = useState<TenantConfig | null>(null);
  const [switching, setSwitching] = useState(false);

  const confirm = async () => {
    if (!target) return;
    setSwitching(true);
    await signOut('user');
    switchTenant(target.id);
  };

  return (
    <div className="space-y-6">
      <SettingSection
        title="White-label brands"
        description="Each firm gets its own name, colours, features and security settings from one validated config. Switching reloads the app and signs you out, so nothing from one brand carries into another."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Object.values(TENANT_PRESETS).map((preset) => (
            <TenantCard
              key={preset.id}
              preset={preset}
              active={preset.id === tenant.id}
              onSwitch={() => setTarget(preset)}
            />
          ))}
        </div>
      </SettingSection>

      <EmbedPreview />

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => !open && !switching && setTarget(null)}
        title={target ? `Switch to ${target.name}?` : ''}
        description={
          target
            ? `You will be signed out and the app reloads as ${target.productName}. Sign in again with the same demo account.`
            : ''
        }
        confirmLabel="Switch and sign out"
        tone="primary"
        loading={switching}
        onConfirm={() => void confirm()}
      />
    </div>
  );
}
