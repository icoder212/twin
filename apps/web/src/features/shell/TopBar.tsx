import { Search } from 'lucide-react';
import { Link } from 'react-router';
import { BrandLogo } from '@/shared/components/BrandLogo';
import { Button } from '@/shared/ui/button';
import { Kbd } from '@/shared/ui/feedback';
import { NotificationsMenu, ThemeMenu, UserMenu } from './HeaderMenus';
import { MarketClock } from './MarketClock';
import { usePaletteStore } from './palette-store';

export function TopBar() {
  const show = usePaletteStore((s) => s.show);
  return (
    <header className="sticky top-0 z-20 border-b border-line pt-safe glass">
      <div className="flex h-14 items-center gap-2 px-4 sm:px-6 lg:h-16 lg:px-8">
        <Link to="/desk" className="lg:hidden" aria-label="Go to today">
          <BrandLogo />
        </Link>
        <button
          type="button"
          onClick={() => show()}
          className="hidden h-9 w-full max-w-sm items-center gap-2 rounded-lg border border-line bg-surface/70 px-3 text-left text-[13px] text-fg-subtle transition-colors hover:border-line-strong lg:flex"
        >
          <Search className="size-4" aria-hidden />
          <span className="flex-1">Search, or type / for a shortcut</span>
          <Kbd>⌘K</Kbd>
        </button>
        <div className="ml-auto flex items-center gap-1">
          <MarketClock />
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Search"
            onClick={() => show()}
          >
            <Search />
          </Button>
          <NotificationsMenu />
          <ThemeMenu />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
