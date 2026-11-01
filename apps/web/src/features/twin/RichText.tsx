import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface RichTextProps {
  text: string;
  onCitation?: (index: number) => void;
  /** Citation indexes that were actually retrieved; anything else renders as plain text. */
  validCitations?: number[];
  streaming?: boolean;
  className?: string;
}

/**
 * Renders the small formatting subset answers use: paragraphs, "- " bullets, **bold**,
 * [n] citations and /shortcut tokens. It builds React elements from text and never parses
 * HTML, so nothing a model or a document says can inject markup or script.
 */
export function RichText({
  text,
  onCitation,
  validCitations,
  streaming,
  className,
}: RichTextProps) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className={cn('space-y-3 text-[14.5px] leading-[1.7] text-fg', className)}>
      {blocks.map((block, i) => {
        const last = i === blocks.length - 1;
        const caret = streaming && last ? <Caret /> : null;
        const lines = block.split('\n');
        if (lines.every((l) => l.startsWith('- '))) {
          return (
            <ul key={i} className="space-y-1.5 pl-1">
              {lines.map((line, j) => (
                <li key={j} className="flex gap-2.5">
                  <span
                    aria-hidden
                    className="mt-[0.7em] size-1.5 shrink-0 rounded-full bg-brand-fg/70"
                  />
                  <span>
                    {inline(line.slice(2), onCitation, validCitations)}
                    {j === lines.length - 1 ? caret : null}
                  </span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            {lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 ? <br /> : null}
                {inline(line, onCitation, validCitations)}
              </Fragment>
            ))}
            {caret}
          </p>
        );
      })}
    </div>
  );
}

const TOKEN =
  /(\*\*[^*]+\*\*|\[\d{1,2}\]|(?<![\w/])\/[a-z][a-z0-9-]{1,23}(?:\s+(?:[A-Z][A-Z0-9]{2,11}|\d+(?:\.\d+)?)){0,2})/g;

function inline(text: string, onCitation?: (index: number) => void, valid?: number[]): ReactNode[] {
  const out: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(TOKEN)) {
    const token = match[0];
    const at = match.index;
    if (at > cursor) out.push(text.slice(cursor, at));
    if (token.startsWith('**')) {
      out.push(
        <strong key={at} className="font-semibold text-fg">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('[')) {
      const n = Number(token.slice(1, -1));
      out.push(
        !valid || valid.includes(n) ? <CitationChip key={at} n={n} onClick={onCitation} /> : token,
      );
    } else {
      out.push(
        <code
          key={at}
          className="rounded-md border border-line bg-surface-2 px-1.5 py-px font-mono text-[12.5px] text-brand-fg"
        >
          {token}
        </code>,
      );
    }
    cursor = at + token.length;
  }
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

export function CitationChip({ n, onClick }: { n: number; onClick?: (n: number) => void }) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(n)}
      aria-label={`Source ${n}`}
      className="mx-0.5 inline-grid h-[18px] min-w-[18px] place-items-center rounded border border-brand-fg/40 bg-brand/15 px-1 align-[1px] font-mono text-[10.5px] leading-none font-semibold text-brand-fg transition-colors hover:bg-brand/30"
    >
      {n}
    </button>
  );
}

function Caret() {
  return (
    <span
      aria-hidden
      className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] animate-caret bg-brand-fg"
    />
  );
}
