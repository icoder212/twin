import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './button';

type Variant = 'center' | 'sheet-right' | 'sheet-bottom' | 'responsive';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** `responsive` is a bottom sheet on phones and a centred dialog from the sm breakpoint. */
  variant?: Variant;
  /** Prevents closing by Escape or backdrop click, e.g. the idle sign-out warning. */
  dismissible?: boolean;
  /** Renders only the body; the title is kept for screen readers. */
  bare?: boolean;
  className?: string;
  bodyClassName?: string;
}

const sizes = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' };

const variants: Record<Variant, string> = {
  center: 'm-auto w-[calc(100%-2rem)] rounded-2xl animate-rise',
  'sheet-right':
    'ml-auto mr-0 my-0 h-dvh max-h-dvh w-full max-w-lg rounded-none border-y-0 border-r-0 animate-fade-in',
  'sheet-bottom':
    'mx-0 mb-0 mt-auto w-full max-w-none max-h-[88dvh] rounded-b-none rounded-t-2xl border-b-0 animate-rise',
  responsive:
    'mx-0 mb-0 mt-auto w-full max-w-none max-h-[90dvh] rounded-b-none rounded-t-2xl border-b-0 animate-rise sm:m-auto sm:max-h-[85dvh] sm:w-[calc(100%-2rem)] sm:rounded-2xl sm:border-b',
};

/**
 * Modal built on the native <dialog> element: the browser handles focus trapping, Escape,
 * the inert background and the top layer, and nothing injects styles at runtime.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  variant = 'responsive',
  dismissible = true,
  bare = false,
  className,
  bodyClassName,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    // Backdrop clicks close the dialog; Escape (onCancel) is the keyboard equivalent.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onOpenChange(false);
      }}
      onClose={() => {
        if (open) onOpenChange(false);
      }}
      onClick={(event) => {
        if (dismissible && event.target === ref.current) onOpenChange(false);
      }}
      className={cn(
        'border border-line bg-surface p-0 text-fg shadow-2xl shadow-black/40 backdrop:bg-transparent',
        variant !== 'sheet-right' && variant !== 'sheet-bottom' && sizes[size],
        variants[variant],
        className,
      )}
    >
      {open && bare ? (
        <>
          <h2 id={titleId} className="sr-only">
            {title}
          </h2>
          {children}
        </>
      ) : open ? (
        <div className="flex max-h-[inherit] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-semibold tracking-tight">
                {title}
              </h2>
              {description ? (
                <p id={descriptionId} className="mt-1 text-[13px] leading-relaxed text-fg-muted">
                  {description}
                </p>
              ) : null}
            </div>
            {dismissible ? (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onOpenChange(false)}
                aria-label="Close"
              >
                <X />
              </Button>
            ) : null}
          </div>
          <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-4', bodyClassName)}>
            {children}
          </div>
          {footer ? (
            <div className="flex flex-col-reverse gap-2 border-t border-line px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
              {footer}
            </div>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tone = 'danger',
  loading,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant={tone} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
