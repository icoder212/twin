import { cn } from '@/lib/cn';

export function navLinkClass({ isActive }: { isActive: boolean }) {
  return cn(
    'group relative flex h-9 items-center gap-3 rounded-lg px-3 text-[13.5px] font-medium transition-colors',
    isActive ? 'bg-surface-2 text-fg' : 'text-fg-muted hover:bg-surface-2/60 hover:text-fg',
  );
}
