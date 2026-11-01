import { ArrowUp, ShieldAlert, Square } from 'lucide-react';
import {
  useDeferredValue,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import {
  detectPii,
  hasHiddenCharacters,
  PII_LABELS,
  redactPii,
  type Shortcut,
} from '@twindesk/core';
import { useShortcuts } from '@/features/shortcuts/queries';
import { useTenant } from '@/features/tenant/tenant-context';
import { cn } from '@/lib/cn';
import { Button } from '@/shared/ui/button';

const MAX = 2000;

interface ComposerProps {
  onSend: (text: string) => void;
  onStop: () => void;
  pending: boolean;
  compact?: boolean;
  /** Text to start with; change the component key to apply a new one. */
  initialValue?: string;
}

export function Composer({ onSend, onStop, pending, compact, initialValue }: ComposerProps) {
  const [value, setValue] = useState(initialValue ?? '');
  const [active, setActive] = useState(0);
  const [menuDismissed, setMenuDismissed] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const listId = useId();
  const noticeId = useId();
  const { tenant } = useTenant();
  const { data: shortcuts = [] } = useShortcuts();

  // PII scanning runs on a deferred copy so typing never stutters.
  const deferred = useDeferredValue(value);
  const pii = useMemo(() => detectPii(deferred), [deferred]);
  const hidden = useMemo(() => hasHiddenCharacters(deferred), [deferred]);
  const piiKinds = [...new Set(pii.map((m) => PII_LABELS[m.kind].toLowerCase()))];

  const slashQuery = /^\/[a-z-]*$/i.test(value) ? value.toLowerCase() : null;
  const matches = useMemo<Shortcut[]>(
    () =>
      slashQuery === null
        ? []
        : shortcuts.filter((s) => s.command.startsWith(slashQuery)).slice(0, 7),
    [shortcuts, slashQuery],
  );
  const menuOpen = matches.length > 0 && !menuDismissed;

  useLayoutEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, compact ? 140 : 220)}px`;
  }, [value, compact]);

  const choose = (s: Shortcut) => {
    setValue(s.argsHint ? `${s.command} ${s.argsHint}` : `${s.command} `);
    setMenuDismissed(true);
    textarea.current?.focus();
  };

  const send = () => {
    const text = value.trim();
    if (!text || pending) return;
    onSend(text);
    setValue('');
    setMenuDismissed(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActive((i) => (i + 1) % matches.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActive((i) => (i - 1 + matches.length) % matches.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const pick = matches[active];
        if (pick) {
          event.preventDefault();
          choose(pick);
          return;
        }
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuDismissed(true);
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  };

  return (
    <div className="relative">
      {menuOpen ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Shortcuts"
          className="absolute inset-x-0 bottom-full z-20 mb-2 animate-rise overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-xl shadow-black/30"
        >
          {matches.map((s, i) => (
            // Keyboard is handled by the textarea (combobox pattern), so options are not tab stops.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
            <div
              key={s.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(s)}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2',
                i === active ? 'bg-surface-2' : '',
              )}
            >
              <span className="w-28 shrink-0 font-mono text-[13px] text-brand-fg">
                {s.command}
                {s.argsHint ? <span className="text-fg-subtle"> {s.argsHint}</span> : null}
              </span>
              <span className="min-w-0 truncate text-[12.5px] text-fg-muted">{s.description}</span>
            </div>
          ))}
        </div>
      ) : null}

      {pii.length || hidden ? (
        <div
          id={noticeId}
          role="status"
          className="mb-2 flex flex-col gap-2 rounded-xl border border-warning/35 bg-warning/10 px-3 py-2.5 sm:flex-row sm:items-center"
        >
          <ShieldAlert className="size-4 shrink-0 text-warning" aria-hidden />
          <p className="flex-1 text-[12.5px] leading-snug text-fg">
            {pii.length
              ? `This looks like it contains ${piiKinds.join(' and ')}. Please do not share personal or account details; they will be removed before sending.`
              : 'Hidden formatting characters will be removed before sending.'}
          </p>
          {pii.length ? (
            <Button size="sm" variant="secondary" onClick={() => setValue(redactPii(value))}>
              Remove them now
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-end gap-2 rounded-2xl border border-line-strong p-2 shadow-[0_12px_40px_-24px_var(--color-brand)] glass focus-within:border-brand-fg/60">
        <label htmlFor={`${listId}-input`} className="sr-only">
          Ask {tenant.productName}
        </label>
        <textarea
          id={`${listId}-input`}
          ref={textarea}
          value={value}
          rows={1}
          maxLength={MAX}
          onChange={(e) => {
            setValue(e.target.value);
            setActive(0);
            setMenuDismissed(false);
          }}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? listId : undefined}
          aria-activedescendant={menuOpen ? `${listId}-${active}` : undefined}
          aria-autocomplete="list"
          aria-describedby={pii.length || hidden ? noticeId : undefined}
          placeholder={
            compact
              ? 'Ask a question, or type /'
              : 'Ask about your rules, trades or notes, or type / for a shortcut'
          }
          spellCheck
          autoComplete="off"
          className="max-h-[220px] min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[14.5px] leading-relaxed text-fg placeholder:text-fg-subtle focus:outline-none"
        />
        {pending ? (
          <Button variant="secondary" size="icon" onClick={onStop} aria-label="Stop the answer">
            <Square className="size-3.5 fill-current" />
          </Button>
        ) : (
          <Button
            variant="primary"
            size="icon"
            onClick={send}
            disabled={!value.trim()}
            aria-label="Send"
          >
            <ArrowUp />
          </Button>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 px-1 text-[11px] text-fg-subtle">
        <p>
          Describes, never advises. Please do not share personal or account details. Answers are
          logged with an id.
        </p>
        {value.length > MAX * 0.8 ? (
          <span className={cn('shrink-0 font-mono tabular', value.length >= MAX && 'text-danger')}>
            {value.length.toLocaleString()} / {MAX.toLocaleString()}
          </span>
        ) : null}
      </div>
    </div>
  );
}
