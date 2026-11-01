import { ArrowDown, ArrowRight, Sparkles } from 'lucide-react';
import { useTenant } from '@/features/tenant/tenant-context';
import { cn } from '@/lib/cn';

function Column({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="min-w-0 flex-1 rounded-xl border border-line bg-surface-2/50 p-3">
      <p className="font-mono text-[10px] tracking-[0.16em] text-fg-subtle uppercase">{title}</p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {items.length === 0 ? <li className="text-xs text-fg-subtle">None</li> : null}
        {items.map((item) => (
          <li
            key={item}
            className="rounded-md border border-line bg-surface px-2 py-1 text-xs font-medium text-fg"
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Arrow() {
  return (
    <span aria-hidden className="grid shrink-0 place-items-center text-fg-subtle">
      <ArrowDown className="size-4 sm:hidden" />
      <ArrowRight className="hidden size-4 sm:block" />
    </span>
  );
}

/** Sources → the twin → destinations, as on the product page. */
export function FlowDiagram({
  sources,
  destinations,
  className,
}: {
  sources: string[];
  destinations: string[];
  className?: string;
}) {
  const { tenant } = useTenant();
  return (
    <figure
      className={cn('flex flex-col items-stretch gap-2 sm:flex-row sm:items-center', className)}
    >
      <figcaption className="sr-only">
        Reads from {sources.join(', ') || 'no sources'}, planned and checked by {tenant.productName}
        , written to {destinations.join(', ') || 'no destinations'}.
      </figcaption>
      <Column title="Reads from" items={sources} />
      <Arrow />
      <div className="flex shrink-0 items-center gap-2 rounded-xl px-3 py-3 glass-strong sm:max-w-40 sm:flex-col sm:text-center">
        <Sparkles className="size-4 text-brand-fg" aria-hidden />
        <p className="text-xs leading-snug font-semibold text-fg">
          {tenant.productName}
          <span className="block font-normal text-fg-muted">plans and checks</span>
        </p>
      </div>
      <Arrow />
      <Column title="Writes to" items={destinations} />
    </figure>
  );
}
