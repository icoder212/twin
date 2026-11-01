import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { formatMoney, type FormatLocale } from '@twindesk/core';

interface EquityChartProps {
  series: number[];
  locale: FormatLocale;
  currency: string;
  /** Session start, as minutes after midnight, for the time axis. */
  startMinutes?: number;
  stepMinutes?: number;
}

const HEIGHT = 184;
const PAD = { top: 16, right: 64, bottom: 24, left: 44 };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

const clock = (minutes: number) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(Math.round(minutes % 60)).padStart(2, '0')}`;

const compact = (value: number, locale: FormatLocale, currency: string) =>
  new Intl.NumberFormat(locale.language, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);

/**
 * Intraday equity, one series. A crosshair snaps to the nearest sample on hover, arrow keys move
 * it for keyboard users, and a hidden table carries every value for screen readers.
 */
export function EquityChart({
  series,
  locale,
  currency,
  startMinutes = 7 * 60,
  stepMinutes = 9,
}: EquityChartProps) {
  const [containerRef, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const gradientId = useId();
  const start = series[0] ?? 0;
  const last = series.at(-1) ?? 0;

  const geometry = useMemo(() => {
    if (width === 0 || series.length < 2) return null;
    const min = Math.min(...series);
    const max = Math.max(...series);
    const span = Math.max(1, max - min);
    const lo = min - span * 0.12;
    const hi = max + span * 0.12;
    const innerW = width - PAD.left - PAD.right;
    const innerH = HEIGHT - PAD.top - PAD.bottom;
    const x = (i: number) => PAD.left + (i / (series.length - 1)) * innerW;
    const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * innerH;
    const line = series
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join('');
    const area = `${line}L${x(series.length - 1).toFixed(1)},${PAD.top + innerH}L${PAD.left},${PAD.top + innerH}Z`;
    const tickStep = niceStep((hi - lo) / 3);
    const ticks: number[] = [];
    for (let t = Math.ceil(lo / tickStep) * tickStep; t <= hi; t += tickStep) ticks.push(t);
    return { x, y, line, area, ticks, innerW, innerH };
  }, [series, width]);

  const pick = (clientX: number, rect: DOMRect) => {
    if (!geometry) return;
    const ratio = (clientX - rect.left - PAD.left) / geometry.innerW;
    setActive(Math.max(0, Math.min(series.length - 1, Math.round(ratio * (series.length - 1)))));
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) =>
    pick(event.clientX, event.currentTarget.getBoundingClientRect());

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const step = event.shiftKey ? 8 : 1;
    if (event.key === 'ArrowRight')
      setActive((i) => Math.min(series.length - 1, (i ?? series.length - 1) + step));
    else if (event.key === 'ArrowLeft')
      setActive((i) => Math.max(0, (i ?? series.length - 1) - step));
    else if (event.key === 'Home') setActive(0);
    else if (event.key === 'End') setActive(series.length - 1);
    else if (event.key === 'Escape') setActive(null);
    else return;
    event.preventDefault();
  };

  const activeValue = active !== null ? series[active] : undefined;
  const readout =
    active !== null && activeValue !== undefined
      ? `${clock(startMinutes + active * stepMinutes)}, equity ${formatMoney(activeValue, locale, currency)}, ${signed(activeValue - start, locale, currency)} since the start of the day`
      : '';
  const summary = `Intraday equity from ${formatMoney(start, locale, currency)} to ${formatMoney(last, locale, currency)}, ${signed(last - start, locale, currency)} today. Use the left and right arrow keys to read values.`;

  return (
    <div ref={containerRef} className="relative w-full select-none">
      {geometry ? (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={summary}
          tabIndex={0}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setActive(null)}
          onKeyDown={onKeyDown}
          onBlur={() => setActive(null)}
          className="block touch-pan-y rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand-fg/50"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--color-brand-fg)" stopOpacity={0.16} />
              <stop offset="100%" stopColor="var(--color-brand-fg)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {geometry.ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={PAD.left + geometry.innerW}
                y1={geometry.y(t)}
                y2={geometry.y(t)}
                stroke="var(--color-line)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={geometry.y(t)}
                dy="0.32em"
                textAnchor="end"
                className="fill-fg-subtle font-mono text-[10px] tabular"
              >
                {compact(t, locale, currency)}
              </text>
            </g>
          ))}
          {/* Start-of-day reference: the line every intraday figure is read against. */}
          <line
            x1={PAD.left}
            x2={PAD.left + geometry.innerW}
            y1={geometry.y(start)}
            y2={geometry.y(start)}
            stroke="var(--color-line-strong)"
            strokeWidth={1}
          />
          <text
            x={PAD.left + geometry.innerW + 8}
            y={geometry.y(start)}
            dy="0.32em"
            className="fill-fg-subtle text-[10px]"
          >
            Start
          </text>
          <path d={geometry.area} fill={`url(#${gradientId})`} />
          <path
            d={geometry.line}
            fill="none"
            stroke="var(--color-brand-fg)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle
            cx={geometry.x(series.length - 1)}
            cy={geometry.y(last)}
            r={4}
            fill="var(--color-brand-fg)"
            stroke="var(--color-surface)"
            strokeWidth={2}
          />
          {active === null ? (
            <text
              x={geometry.x(series.length - 1) + 10}
              y={geometry.y(last)}
              dy="0.32em"
              className="fill-fg text-[11px] font-semibold"
            >
              {compact(last, locale, currency)}
            </text>
          ) : null}
          {[0, Math.floor((series.length - 1) / 2), series.length - 1].map((i) => (
            <text
              key={i}
              x={geometry.x(i)}
              y={HEIGHT - 6}
              textAnchor={i === 0 ? 'start' : i === series.length - 1 ? 'end' : 'middle'}
              className="fill-fg-subtle font-mono text-[10px]"
            >
              {clock(startMinutes + i * stepMinutes)}
            </text>
          ))}
          {active !== null && activeValue !== undefined ? (
            <g pointerEvents="none">
              <line
                x1={geometry.x(active)}
                x2={geometry.x(active)}
                y1={PAD.top}
                y2={PAD.top + geometry.innerH}
                stroke="var(--color-fg-subtle)"
                strokeWidth={1}
              />
              <circle
                cx={geometry.x(active)}
                cy={geometry.y(activeValue)}
                r={4.5}
                fill="var(--color-brand-fg)"
                stroke="var(--color-surface)"
                strokeWidth={2}
              />
            </g>
          ) : null}
          {/* Transparent hit area wider than the line, so the pointer never has to land on it. */}
          <rect x={PAD.left} y={0} width={geometry.innerW} height={HEIGHT} fill="transparent" />
        </svg>
      ) : (
        <div style={{ height: HEIGHT }} />
      )}

      {geometry && active !== null && activeValue !== undefined ? (
        <div
          aria-hidden
          className="pointer-events-none absolute top-1 z-10 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 shadow-lg"
          style={{
            left: Math.min(Math.max(geometry.x(active) - 70, 0), Math.max(0, width - 150)),
          }}
        >
          <p className="text-[13px] font-semibold text-fg">
            {formatMoney(activeValue, locale, currency)}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-fg-muted">
            <span aria-hidden className="h-0.5 w-3 rounded-full bg-brand-fg" />
            {clock(startMinutes + active * stepMinutes)} ·{' '}
            {signed(activeValue - start, locale, currency)}
          </p>
        </div>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {readout}
      </p>
      <table className="sr-only">
        <caption>Intraday equity, every hour</caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Equity</th>
          </tr>
        </thead>
        <tbody>
          {series
            .map((v, i) => ({ v, i }))
            .filter(({ i }) => (i * stepMinutes) % 60 < stepMinutes || i === series.length - 1)
            .map(({ v, i }) => (
              <tr key={i}>
                <td>{clock(startMinutes + i * stepMinutes)}</td>
                <td>{formatMoney(v, locale, currency)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

function niceStep(raw: number): number {
  const power = 10 ** Math.floor(Math.log10(raw));
  const n = raw / power;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * power;
}

function signed(value: number, locale: FormatLocale, currency: string): string {
  const formatted = formatMoney(Math.abs(value), locale, currency);
  return value >= 0 ? `+${formatted}` : `−${formatted}`;
}
