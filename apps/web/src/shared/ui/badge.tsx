import type { ComponentProps } from 'react';
import type { Tone } from '@twindesk/core';
import { cn } from '@/lib/cn';

export const toneClasses: Record<Tone, string> = {
  neutral: 'border-line bg-surface-2 text-fg-muted',
  brand: 'border-brand-fg/30 bg-brand/12 text-brand-fg',
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  danger: 'border-danger/30 bg-danger/10 text-danger',
  info: 'border-info/30 bg-info/10 text-info',
};

export const toneText: Record<Tone, string> = {
  neutral: 'text-fg-muted',
  brand: 'text-brand-fg',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
};

export const toneBg: Record<Tone, string> = {
  neutral: 'bg-fg-subtle',
  brand: 'bg-brand-fg',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
};

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: ComponentProps<'span'> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap [&_svg]:size-3',
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}

export function StatusDot({
  tone = 'neutral',
  pulse,
  className,
}: {
  tone?: Tone;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-2 shrink-0 rounded-full',
        toneBg[tone],
        pulse && 'animate-pulse-ring',
        toneText[tone],
        className,
      )}
    />
  );
}
