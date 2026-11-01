import {
  Bell,
  CircleAlert,
  Info,
  LogOut,
  Monitor,
  Moon,
  Settings,
  Sun,
  TriangleAlert,
  UserRound,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { formatRelative, ROLE_LABELS, safeUrl, type Severity } from '@twindesk/core';
import { useMarkNotificationsRead, useNotifications } from '@/features/alerts/queries';
import { useAuth } from '@/features/auth/use-auth';
import { useTenant } from '@/features/tenant/tenant-context';
import { cn } from '@/lib/cn';
import { useLocale } from '@/shared/hooks/use-locale';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Avatar } from '@/shared/ui/feedback';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/menu';

const severityIcon: Record<Severity, { icon: typeof Info; className: string }> = {
  info: { icon: Info, className: 'text-info' },
  warning: { icon: TriangleAlert, className: 'text-warning' },
  critical: { icon: CircleAlert, className: 'text-danger' },
};

export function NotificationsMenu() {
  const { data = [] } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const navigate = useNavigate();
  const locale = useLocale();
  const unread = data.filter((n) => !n.read);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={unread.length ? `Notifications, ${unread.length} unread` : 'Notifications'}
          className="relative"
        >
          <Bell />
          {unread.length ? (
            <span
              aria-hidden
              className="absolute top-2 right-2 size-2 rounded-full bg-danger ring-2 ring-bg"
            />
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[min(92vw,380px)] p-0">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {unread.length ? (
            <button
              type="button"
              className="text-xs font-medium text-brand-fg hover:underline"
              onClick={() => markRead.mutate(unread.map((n) => n.id))}
            >
              Mark all read
            </button>
          ) : null}
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-1">
          {data.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-fg-subtle">Nothing new.</p>
          ) : null}
          {data.map((n) => {
            const { icon: Icon, className } = severityIcon[n.severity];
            const href = safeUrl(n.href, { allowRelative: true });
            return (
              <DropdownMenuItem
                key={n.id}
                className="items-start py-2.5"
                onSelect={() => {
                  if (!n.read) markRead.mutate([n.id]);
                  if (href?.startsWith('/')) void navigate(href);
                }}
              >
                <Icon className={cn('mt-0.5', className)} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block text-[13px]',
                      n.read ? 'text-fg-muted' : 'font-semibold text-fg',
                    )}
                  >
                    {n.title}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-fg-subtle">
                    {n.body}
                  </span>
                  <span className="mt-1 block font-mono text-[10.5px] text-fg-subtle">
                    {formatRelative(n.at, locale)}
                  </span>
                </span>
                {!n.read ? (
                  <span
                    aria-label="Unread"
                    className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-fg"
                  />
                ) : null}
              </DropdownMenuItem>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ThemeMenu() {
  const { scheme, schemePreference, setSchemePreference } = useTenant();
  const options = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'Match device', icon: Monitor },
  ] as const;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Colour scheme">
          {scheme === 'dark' ? <Moon /> : <Sun />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-40">
        {options.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem
            key={value}
            onSelect={() => setSchemePreference(value)}
            className={cn(schemePreference === value && 'text-fg')}
          >
            <Icon aria-hidden />
            {label}
            {schemePreference === value ? (
              <span className="ml-auto size-1.5 rounded-full bg-brand-fg" aria-label="Selected" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UserMenu() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full p-0.5 pr-1 transition-colors hover:bg-surface-2"
          aria-label="Account menu"
        >
          <Avatar name={user.name} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-1">
          <span className="text-[13px] font-semibold text-fg">{user.name}</span>
          <span className="truncate">{user.email}</span>
          <Badge tone="brand" className="mt-1 self-start">
            {ROLE_LABELS[user.role]}
          </Badge>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void navigate('/settings?tab=profile')}>
          <UserRound aria-hidden /> Profile and security
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void navigate('/settings')}>
          <Settings aria-hidden /> Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => void signOut('user')}
          className="text-danger data-[highlighted]:text-danger"
        >
          <LogOut aria-hidden /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
