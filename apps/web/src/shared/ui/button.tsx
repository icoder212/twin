import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export const buttonVariants = cva(
  'relative inline-flex shrink-0 items-center justify-center gap-2 font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,filter] duration-150 select-none active:brightness-95 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'brand-gradient text-on-brand shadow-[0_10px_30px_-14px_var(--color-brand)] hover:brightness-110',
        secondary:
          'border border-line bg-surface-2 text-fg hover:border-line-strong hover:bg-surface-3',
        outline: 'border border-line-strong text-brand-fg hover:bg-brand/10',
        ghost: 'text-fg-muted hover:bg-surface-2 hover:text-fg',
        danger: 'border border-danger/35 bg-danger/10 text-danger hover:bg-danger/20',
        link: 'h-auto px-0 text-brand-fg underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 rounded-md px-3 text-[13px]',
        md: 'h-10 rounded-lg px-4 text-sm',
        lg: 'h-12 rounded-xl px-6 text-[15px]',
        icon: 'size-10 rounded-lg',
        'icon-sm': 'size-8 rounded-md',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild,
  loading,
  disabled,
  children,
  type,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      type={asChild ? undefined : (type ?? 'button')}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {children}
        </>
      )}
    </Comp>
  );
}
