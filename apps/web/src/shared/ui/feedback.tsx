import { AlertTriangle, Loader2, RotateCw, type LucideIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { userMessage, type Tone } from '@twindesk/core';
import { cn } from '@/lib/cn';
import { toneBg, toneText } from './badge';
import { Button } from './button';

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center text-fg-subtle', className)}>
      <Loader2 className="size-4 animate-spin" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-md bg-surface-3/70', className)}
      {...props}
    />
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className,
      )}
    >
      <span className="grid size-11 place-items-center rounded-xl border border-line bg-surface-2 text-brand-fg">
        <Icon className="size-5" aria-hidden />
      </span>
      <div>
        <p className="text-sm font-semibold text-fg">{title}</p>
        {description ? (
          <p className="mx-auto mt-1 max-w-sm text-[13px] text-fg-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center gap-3 px-6 py-10 text-center', className)}
    >
      <span className="grid size-11 place-items-center rounded-xl border border-danger/30 bg-danger/10 text-danger">
        <AlertTriangle className="size-5" aria-hidden />
      </span>
      <p className="max-w-sm text-sm text-fg-muted">{userMessage(error)}</p>
      {onRetry ? (
        <Button size="sm" onClick={onRetry}>
          <RotateCw /> Try again
        </Button>
      ) : null}
    </div>
  );
}

export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-surface-2 px-1 font-mono text-[11px] text-fg-muted',
        className,
      )}
      {...props}
    />
  );
}

/** The unfilled track is a lighter step of the fill's own hue, so state reads across the whole bar. */
const trackTone: Record<Tone, string> = {
  neutral: 'bg-surface-3',
  brand: 'bg-brand-fg/15',
  success: 'bg-success/15',
  warning: 'bg-warning/15',
  danger: 'bg-danger/15',
  info: 'bg-info/15',
};

/** Accessible meter with an optional threshold marker, used for limits and usage. */
export function Meter({
  value,
  max,
  label,
  tone = 'brand',
  markers = [],
  className,
  valueText,
}: {
  value: number;
  max: number;
  label: string;
  tone?: Tone;
  markers?: number[];
  className?: string;
  valueText?: string;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      className={cn('relative h-2 w-full overflow-hidden rounded-full', trackTone[tone], className)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-500', toneBg[tone])}
        style={{ width: `${pct}%` }}
      />
      {markers.map((m) => (
        <span
          key={m}
          aria-hidden
          className="absolute inset-y-0 w-px bg-fg-subtle/70"
          style={{ left: `${Math.min(100, (m / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-full brand-gradient text-xs font-semibold text-on-brand',
        className,
      )}
    >
      {initials}
    </span>
  );
}

export function ToneIcon({
  icon: Icon,
  tone = 'brand',
  className,
}: {
  icon: LucideIcon;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-surface-2',
        toneText[tone],
        className,
      )}
    >
      <Icon className="size-4" aria-hidden />
    </span>
  );
}
