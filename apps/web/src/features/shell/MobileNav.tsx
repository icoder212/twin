import { BellRing, Inbox, LayoutDashboard, LogOut, Menu, Settings, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { NavLink } from 'react-router';
import { usePendingApprovalCount } from '@/features/approvals/queries';
import { useAuth } from '@/features/auth/use-auth';
import { useTenant } from '@/features/tenant/tenant-context';
import { cn } from '@/lib/cn';
import { Dialog } from '@/shared/ui/dialog';
import { navLinkClass } from './nav-styles';
import { useNavItems } from './use-nav';

const tabClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'relative flex flex-1 flex-col items-center justify-center gap-1 pt-2 text-[10.5px] font-medium transition-colors',
    isActive ? 'text-brand-fg' : 'text-fg-subtle',
  );

/** Bottom tab bar for phones and small tablets, sized for thumbs and safe areas. */
export function MobileNav() {
  const [more, setMore] = useState(false);
  const pending = usePendingApprovalCount();
  const items = useNavItems();
  const { isEnabled } = useTenant();
  const { signOut } = useAuth();

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line pb-safe glass lg:hidden"
      >
        <div className="mx-auto flex h-14 max-w-lg items-stretch">
          <NavLink to="/desk" className={tabClass}>
            <LayoutDashboard className="size-5" aria-hidden />
            Today
          </NavLink>
          {isEnabled('twin') ? (
            <NavLink to="/twin" className={tabClass}>
              <Sparkles className="size-5" aria-hidden />
              Twin
            </NavLink>
          ) : null}
          {isEnabled('approvals') ? (
            <NavLink to="/approvals" className={tabClass}>
              <span className="relative">
                <Inbox className="size-5" aria-hidden />
                {pending > 0 ? (
                  <span className="absolute -top-1.5 -right-2 rounded-full bg-brand px-1 font-mono text-[9px] leading-4 font-bold text-on-brand">
                    {pending}
                  </span>
                ) : null}
              </span>
              Approvals
            </NavLink>
          ) : null}
          {isEnabled('alerts') ? (
            <NavLink to="/alerts" className={tabClass}>
              <BellRing className="size-5" aria-hidden />
              Alerts
            </NavLink>
          ) : null}
          <button
            type="button"
            className={tabClass({ isActive: more })}
            onClick={() => setMore(true)}
            aria-haspopup="dialog"
          >
            <Menu className="size-5" aria-hidden />
            More
          </button>
        </div>
      </nav>

      <Dialog open={more} onOpenChange={setMore} title="Your desk" variant="sheet-bottom">
        <nav aria-label="All sections" className="grid gap-1 pb-2">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMore(false)}
              className={(s) => cn(navLinkClass(s), 'h-11')}
            >
              <item.icon className="size-4 text-fg-subtle" aria-hidden />
              {item.label}
            </NavLink>
          ))}
          <NavLink
            to="/settings"
            onClick={() => setMore(false)}
            className={(s) => cn(navLinkClass(s), 'h-11')}
          >
            <Settings className="size-4 text-fg-subtle" aria-hidden />
            Settings
          </NavLink>
          <button
            type="button"
            onClick={() => void signOut('user')}
            className={cn(navLinkClass({ isActive: false }), 'h-11 text-danger')}
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </button>
        </nav>
      </Dialog>
    </>
  );
}
