import { Monitor, Moon, Sun } from 'lucide-react';
import type { ColorScheme, ColorSchemePreference, ThemeTokens } from '@twindesk/core';
import { useTenant } from '@/features/tenant/tenant-context';
import { cn } from '@/lib/cn';
import { SettingSection } from './SettingSection';

/** A miniature of the app drawn with the tenant's own tokens. Values are validated hex colours. */
function MiniApp({ tokens, className }: { tokens: ThemeTokens; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('flex h-full w-full', className)}
      style={{ backgroundColor: tokens.bg }}
    >
      <div
        className="flex w-1/4 flex-col gap-1.5 p-2"
        style={{ backgroundColor: tokens.surface, borderRight: `1px solid ${tokens.line}` }}
      >
        <span className="h-1.5 w-3/4 rounded-full" style={{ backgroundColor: tokens.brandFg }} />
        <span className="h-1 w-full rounded-full" style={{ backgroundColor: tokens.fgSubtle }} />
        <span className="h-1 w-2/3 rounded-full" style={{ backgroundColor: tokens.fgSubtle }} />
        <span className="h-1 w-5/6 rounded-full" style={{ backgroundColor: tokens.fgSubtle }} />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <span className="h-1.5 w-1/2 rounded-full" style={{ backgroundColor: tokens.fg }} />
        <span className="h-1 w-3/4 rounded-full" style={{ backgroundColor: tokens.fgMuted }} />
        <div
          className="mt-1 flex-1 rounded-md p-1.5"
          style={{ backgroundColor: tokens.surface, border: `1px solid ${tokens.line}` }}
        >
          <span
            className="block h-1 w-2/3 rounded-full"
            style={{ backgroundColor: tokens.fgMuted }}
          />
          <span
            className="mt-1 block h-1 w-1/2 rounded-full"
            style={{ backgroundColor: tokens.success }}
          />
        </div>
        <span className="h-3 w-1/3 self-end rounded" style={{ backgroundColor: tokens.brand }} />
      </div>
    </div>
  );
}

export function AppearanceTab() {
  const { tenant, schemePreference, setSchemePreference, scheme } = useTenant();
  const options: Array<{
    value: ColorSchemePreference;
    label: string;
    hint: string;
    icon: typeof Sun;
  }> = [
    {
      value: 'light',
      label: 'Light',
      hint: 'Bright surfaces for daylight and print-outs.',
      icon: Sun,
    },
    {
      value: 'dark',
      label: 'Dark',
      hint: 'Low glare for long sessions and trading floors.',
      icon: Moon,
    },
    {
      value: 'system',
      label: 'Match device',
      hint: 'Follows your operating system as it changes.',
      icon: Monitor,
    },
  ];
  const preview = (value: ColorSchemePreference, s: ColorScheme) =>
    value === 'system' ? s : value;

  return (
    <SettingSection
      title="Colour scheme"
      description={`Applies to this device only. ${tenant.name}’s default is ${tenant.theme.defaultScheme === 'system' ? 'to match your device' : tenant.theme.defaultScheme}.`}
    >
      <fieldset>
        <legend className="sr-only">Colour scheme</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {options.map(({ value, label, hint, icon: Icon }) => {
            const selected = schemePreference === value;
            return (
              <label
                key={value}
                className={cn(
                  'cursor-pointer overflow-hidden rounded-xl border transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-brand/30',
                  selected ? 'border-brand-fg/60' : 'border-line hover:border-line-strong',
                )}
              >
                <input
                  type="radio"
                  name="scheme"
                  value={value}
                  checked={selected}
                  onChange={() => setSchemePreference(value)}
                  className="sr-only"
                />
                <div className="relative h-28 border-b border-line">
                  {value === 'system' ? (
                    <div className="flex h-full">
                      <MiniApp tokens={tenant.theme.light} className="w-1/2 overflow-hidden" />
                      <MiniApp tokens={tenant.theme.dark} className="w-1/2 overflow-hidden" />
                    </div>
                  ) : (
                    <MiniApp tokens={tenant.theme[preview(value, scheme)]} />
                  )}
                </div>
                <div className={cn('flex items-start gap-2.5 p-3.5', selected && 'bg-brand/8')}>
                  <Icon
                    className={cn(
                      'mt-0.5 size-4 shrink-0',
                      selected ? 'text-brand-fg' : 'text-fg-subtle',
                    )}
                    aria-hidden
                  />
                  <span>
                    <span className="block text-[13.5px] font-semibold text-fg">{label}</span>
                    <span className="mt-0.5 block text-[12px] leading-relaxed text-fg-muted">
                      {hint}
                    </span>
                  </span>
                </div>
              </label>
            );
          })}
        </div>
      </fieldset>
    </SettingSection>
  );
}
