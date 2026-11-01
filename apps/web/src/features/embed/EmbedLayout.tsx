import { ShieldCheck } from 'lucide-react';
import { useRef } from 'react';
import { Outlet } from 'react-router';
import { useTenant } from '@/features/tenant/tenant-context';
import { EmbedBridge } from './EmbedBridge';

/** Chromeless frame for the twin inside a host platform: no navigation, the host owns that. */
export function EmbedLayout() {
  const { tenant } = useTenant();
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={contentRef} className="flex min-h-dvh flex-col bg-bg text-fg">
      <EmbedBridge contentRef={contentRef} />
      <main id="main" tabIndex={-1} className="flex min-h-0 flex-1 flex-col outline-none">
        <Outlet />
      </main>
      <footer className="flex items-start gap-2 border-t border-line px-4 py-2.5 text-[11px] leading-relaxed text-fg-subtle">
        <ShieldCheck className="mt-px size-3.5 shrink-0 text-success" aria-hidden />
        <span>{tenant.legal.disclaimer}</span>
      </footer>
    </div>
  );
}
