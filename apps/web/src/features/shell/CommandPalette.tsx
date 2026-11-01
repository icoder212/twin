import { ArrowRight, CornerDownLeft, Search, Sparkles, SquareSlash } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { sanitizeText } from '@twindesk/core';
import { useShortcuts } from '@/features/shortcuts/queries';
import { useTenant } from '@/features/tenant/tenant-context';
import { cn } from '@/lib/cn';
import { Dialog } from '@/shared/ui/dialog';
import { Kbd } from '@/shared/ui/feedback';
import { usePaletteStore } from './palette-store';
import { useNavItems } from './use-nav';

interface Option {
  id: string;
  group: 'Go to' | 'Shortcuts' | 'Ask';
  label: string;
  hint?: string;
  icon: typeof Search;
  run: () => void;
}

export function CommandPalette() {
  const { open, initial, hide } = usePaletteStore();
  return open ? <PaletteDialog initial={initial} onClose={hide} /> : null;
}

function PaletteDialog({ initial, onClose }: { initial: string; onClose: () => void }) {
  const [query, setQuery] = useState(initial);
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const navItems = useNavItems();
  const { data: shortcuts = [] } = useShortcuts();
  const { isEnabled, tenant } = useTenant();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const options = useMemo<Option[]>(() => {
    const q = query.trim().toLowerCase();
    const askTwin = (prompt: string) => {
      onClose();
      void navigate('/twin', {
        state: { prompt: sanitizeText(prompt, { maxLength: 2000 }), autoSend: true },
      });
    };
    const go: Option[] = navItems
      .filter(() => !q.startsWith('/'))
      .filter((n) => !q || `${n.label} ${n.keywords ?? ''}`.toLowerCase().includes(q))
      .map((n) => ({
        id: `nav-${n.to}`,
        group: 'Go to',
        label: n.label,
        icon: n.icon,
        run: () => {
          onClose();
          void navigate(n.to);
        },
      }));
    const sc: Option[] = isEnabled('twin')
      ? shortcuts
          .filter(
            (s) => !q || `${s.command} ${s.title}`.toLowerCase().includes(q.split(/\s+/)[0] ?? ''),
          )
          .slice(0, 8)
          .map((s) => {
            const args = q.startsWith(s.command) ? query.trim().slice(s.command.length).trim() : '';
            const prompt = args
              ? `${s.command} ${args}`
              : s.argsHint
                ? `${s.command} ${s.argsHint}`
                : s.command;
            return {
              id: `sc-${s.id}`,
              group: 'Shortcuts',
              label: prompt,
              hint: s.title,
              icon: SquareSlash,
              run: () => askTwin(prompt),
            };
          })
      : [];
    const ask: Option[] =
      q && !q.startsWith('/') && isEnabled('twin')
        ? [
            {
              id: 'ask',
              group: 'Ask',
              label: `Ask ${tenant.productName}: “${query.trim()}”`,
              icon: Sparkles,
              run: () => askTwin(query),
            },
          ]
        : [];
    return [...ask, ...sc, ...go];
  }, [query, navItems, shortcuts, isEnabled, navigate, onClose, tenant.productName]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      options[active]?.run();
    }
  };

  const groups = ['Ask', 'Shortcuts', 'Go to'] as const;

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Search and shortcuts"
      variant="center"
      size="lg"
      bare
      className="mt-[12vh] mb-auto overflow-hidden"
    >
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search className="size-4 text-fg-subtle" aria-hidden />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value.slice(0, 200));
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={options[active] ? `${listId}-${options[active].id}` : undefined}
          aria-autocomplete="list"
          placeholder="Go to a page, run a shortcut or ask a question"
          className="h-14 flex-1 bg-transparent text-[15px] text-fg placeholder:text-fg-subtle focus:outline-none"
          autoComplete="off"
          spellCheck={false}
        />
        <Kbd>Esc</Kbd>
      </div>
      <div
        id={listId}
        role="listbox"
        aria-label="Results"
        className="max-h-[50vh] overflow-y-auto p-2"
      >
        {options.length === 0 ? (
          <p className="px-3 py-8 text-center text-[13px] text-fg-subtle">No matches.</p>
        ) : null}
        {groups.map((group) => {
          const groupOptions = options.filter((o) => o.group === group);
          if (!groupOptions.length) return null;
          return (
            <div key={group} role="presentation" className="mb-1">
              <p
                role="presentation"
                className="px-3 pt-2 pb-1 font-mono text-[10px] tracking-[0.16em] text-fg-subtle uppercase"
              >
                {group}
              </p>
              {groupOptions.map((o) => {
                const index = options.indexOf(o);
                const selected = index === active;
                return (
                  // Keyboard is handled by the combobox input (aria-activedescendant), so options are not tab stops.
                  // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
                  <div
                    key={o.id}
                    id={`${listId}-${o.id}`}
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setActive(index)}
                    onClick={o.run}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px]',
                      selected ? 'bg-surface-2 text-fg' : 'text-fg-muted',
                    )}
                  >
                    <o.icon
                      className={cn(
                        'size-4 shrink-0',
                        selected ? 'text-brand-fg' : 'text-fg-subtle',
                      )}
                      aria-hidden
                    />
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate',
                        o.group === 'Shortcuts' && 'font-mono text-[13px]',
                      )}
                    >
                      {o.label}
                    </span>
                    {o.hint ? (
                      <span className="hidden truncate text-xs text-fg-subtle sm:block">
                        {o.hint}
                      </span>
                    ) : null}
                    {selected ? (
                      <CornerDownLeft className="size-3.5 text-fg-subtle" aria-hidden />
                    ) : (
                      <ArrowRight className="size-3.5 opacity-0" aria-hidden />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 border-t border-line px-4 py-2.5 text-[11px] text-fg-subtle">
        <span className="flex items-center gap-1.5">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> move
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>↵</Kbd> open
        </span>
        <span className="ml-auto">Shortcuts run in the twin and are logged.</span>
      </div>
    </Dialog>
  );
}
