import { useEffect } from 'react';
import { Outlet, useLocation, useNavigation } from 'react-router';
import { useTenant } from '@/features/tenant/tenant-context';
import { CommandPalette } from './CommandPalette';
import { IdleTimeoutDialog } from './IdleTimeoutDialog';
import { MobileNav } from './MobileNav';
import { usePaletteStore } from './palette-store';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

export function AppShell() {
  const navigation = useNavigation();
  const location = useLocation();
  const { tenant } = useTenant();
  const show = usePaletteStore((s) => s.show);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        show();
      } else if (event.key === '/' && !isTyping(event.target) && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        show('/');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show]);

  // Move focus to the page on navigation so screen readers announce the new content.
  useEffect(() => {
    document.getElementById('main')?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="min-h-dvh bg-bg">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-surface px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
      >
        Skip to content
      </a>
      {navigation.state === 'loading' ? (
        <div
          aria-hidden
          className="fixed inset-x-0 top-0 z-50 h-0.5 animate-pulse brand-gradient"
        />
      ) : null}
      <Sidebar />
      <div className="lg:pl-64">
        <TopBar />
        <main
          id="main"
          tabIndex={-1}
          className="min-h-[calc(100dvh-4rem)] pb-24 outline-none lg:pb-12"
        >
          <Outlet />
        </main>
        <footer className="hidden border-t border-line px-8 py-4 text-[11.5px] text-fg-subtle lg:block">
          {tenant.legal.disclaimer}
        </footer>
      </div>
      <MobileNav />
      <CommandPalette />
      <IdleTimeoutDialog />
    </div>
  );
}
