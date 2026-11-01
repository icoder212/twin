import { Settings, ShieldCheck } from 'lucide-react';
import { Link, NavLink } from 'react-router';
import { DESK_LABELS } from '@twindesk/core';
import { useAuth } from '@/features/auth/use-auth';
import { usePendingApprovalCount } from '@/features/approvals/queries';
import { cn } from '@/lib/cn';
import { BrandLogo } from '@/shared/components/BrandLogo';
import { NAV_GROUPS } from './nav';
import { navLinkClass } from './nav-styles';
import { useNavItems } from './use-nav';

export function Sidebar() {
  const items = useNavItems();
  const pending = usePendingApprovalCount();
  const { user } = useAuth();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface/60 backdrop-blur-xl lg:flex">
      <div className="flex h-16 items-center px-5">
        <Link to="/desk" aria-label="Go to today">
          <BrandLogo showProduct />
        </Link>
      </div>

      {user ? (
        <Link
          to="/settings?tab=desk"
          className="mx-4 mb-2 flex items-center justify-between rounded-lg border border-line bg-surface-2/50 px-3 py-2 text-xs transition-colors hover:border-line-strong"
        >
          <span className="text-fg-subtle">Set up for</span>
          <span className="truncate font-medium text-brand-fg">
            {DESK_LABELS[user.deskType].short}
          </span>
        </Link>
      ) : null}

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-2">
        {NAV_GROUPS.map((group) => {
          const groupItems = items.filter((i) => i.group === group);
          if (groupItems.length === 0) return null;
          return (
            <div key={group} className="mb-4">
              <p className="px-3 pb-1.5 font-mono text-[10px] font-medium tracking-[0.16em] text-fg-subtle uppercase">
                {group}
              </p>
              <ul className="flex flex-col gap-0.5">
                {groupItems.map((item) => (
                  <li key={item.to}>
                    <NavLink to={item.to} className={navLinkClass}>
                      {({ isActive }) => (
                        <>
                          {isActive ? (
                            <span
                              aria-hidden
                              className="absolute inset-y-2 left-0 w-0.5 rounded-full brand-gradient"
                            />
                          ) : null}
                          <item.icon
                            className={cn(
                              'size-4 shrink-0',
                              isActive
                                ? 'text-brand-fg'
                                : 'text-fg-subtle group-hover:text-fg-muted',
                            )}
                            aria-hidden
                          />
                          <span className="truncate">{item.label}</span>
                          {item.badge === 'approvals' && pending > 0 ? (
                            <span
                              className="ml-auto rounded-full bg-brand px-1.5 py-px font-mono text-[10px] font-semibold text-on-brand"
                              aria-label={`${pending} waiting`}
                            >
                              {pending}
                            </span>
                          ) : null}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-line p-3">
        <div className="rounded-xl border border-line bg-surface-2/40 p-3">
          <p className="flex items-center gap-2 text-xs font-semibold text-fg">
            <ShieldCheck className="size-3.5 text-success" aria-hidden /> Controls on
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-fg-subtle">
            Read-only by default. Eight advice checks on every answer. Nothing leaves without your
            approval.
          </p>
        </div>
        <NavLink to="/settings" className={navLinkClass}>
          <Settings className="size-4 text-fg-subtle" aria-hidden />
          Settings
        </NavLink>
      </div>
    </aside>
  );
}
