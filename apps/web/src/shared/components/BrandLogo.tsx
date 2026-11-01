import { useState } from 'react';
import { safeUrl } from '@twindesk/core';
import { useTenant } from '@/features/tenant/tenant-context';
import { cn } from '@/lib/cn';

/** Rendered height of the full logo in CSS pixels; matches the `h-7` class below. */
const LOGO_HEIGHT = 28;

/**
 * The tenant's logo. Uses the full logo for the current colour scheme when the tenant supplies
 * one, and otherwise the mark with a text wordmark, which adapts to light, dark and any brand.
 * `compact` shows the mark alone.
 */
export function BrandLogo({
  className,
  compact = false,
  showProduct = false,
}: {
  className?: string;
  compact?: boolean;
  showProduct?: boolean;
}) {
  const { tenant, scheme } = useTenant();
  const { brand } = tenant;
  const name = `${brand.wordmark}${brand.wordmarkAccent ?? ''}`;
  const logoUrl = brand.logo
    ? safeUrl(scheme === 'dark' ? brand.logo.onDark : brand.logo.onLight)
    : null;
  // A tenant-hosted logo can fail to load; fall back to the text wordmark rather than a gap.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const mark = safeUrl(brand.markUrl);

  const product = showProduct ? (
    <span className="mt-1.5 truncate font-mono text-[10px] tracking-[0.18em] text-fg-subtle uppercase">
      {tenant.productName}
    </span>
  ) : null;

  if (brand.logo && logoUrl && logoUrl !== failedUrl && !compact) {
    return (
      <span className={cn('inline-flex min-w-0 flex-col leading-none', className)}>
        <img
          src={logoUrl}
          alt={name}
          width={Math.round(LOGO_HEIGHT * brand.logo.aspectRatio)}
          height={LOGO_HEIGHT}
          className="h-7 w-auto max-w-full self-start object-contain"
          decoding="async"
          onError={() => setFailedUrl(logoUrl)}
        />
        {product}
      </span>
    );
  }

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      {mark ? (
        <img
          src={mark}
          alt=""
          width={32}
          height={32}
          className="size-8 shrink-0 object-contain"
          decoding="async"
        />
      ) : (
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-lg brand-gradient text-sm font-bold text-on-brand"
        >
          {brand.wordmark.charAt(0)}
        </span>
      )}
      {compact ? (
        <span className="sr-only">{tenant.name}</span>
      ) : (
        <span className="flex min-w-0 flex-col leading-none">
          <span className="truncate text-[17px] font-semibold tracking-tight text-fg">
            {brand.wordmark}
            {brand.wordmarkAccent ? (
              <span className="text-gradient">{brand.wordmarkAccent}</span>
            ) : null}
          </span>
          {product}
        </span>
      )}
    </span>
  );
}
