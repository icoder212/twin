import { useEffect, useState } from 'react';
import { formatTime } from '@twindesk/core';
import { useLocale } from '@/shared/hooks/use-locale';
import { StatusDot } from '@/shared/ui/badge';

function sessionState(minutes: number) {
  const open = 7 * 60;
  const close = 16 * 60 + 30;
  if (minutes >= open && minutes < close) return { inside: true, label: 'Your session is open' };
  return { inside: false, label: 'Outside your session' };
}

/** The user's session rule at a glance, in their own timezone. */
export function MarketClock() {
  const locale = useLocale();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const [h = 0, m = 0] = formatTime(now, { ...locale, language: 'en-GB' })
    .split(':')
    .map(Number);
  const state = sessionState(h * 60 + m);
  return (
    <div className="hidden items-center gap-2.5 rounded-full border border-line bg-surface/60 px-3 py-1.5 text-xs md:flex">
      <StatusDot tone={state.inside ? 'success' : 'neutral'} pulse={state.inside} />
      <span className="font-mono text-fg tabular">{formatTime(now, locale)}</span>
      <span className="text-fg-subtle">London</span>
      <span aria-hidden className="h-3 w-px bg-line-strong" />
      <span className="text-fg-muted">{state.label}</span>
    </div>
  );
}
