import type { ComplianceCheckId, ComplianceCheckResult } from '../domain/twin';

/**
 * The eight advice checks. They run as code after the model writes a draft, so no model grades
 * its own work. The same module runs in the client (to preview drafts and approvals) and on the
 * server (as the gate that actually decides what is shown).
 */
export const ADVICE_CHECKS: ReadonlyArray<{
  id: ComplianceCheckId;
  label: string;
  description: string;
}> = [
  {
    id: 'no-recommendation',
    label: 'No buy, sell or hold recommendation',
    description: 'The text does not tell the reader to open, close, add to or keep a position.',
  },
  {
    id: 'no-price-target',
    label: 'No price targets',
    description: 'No level is presented as a target, objective or place price is heading.',
  },
  {
    id: 'no-forecast',
    label: 'No market predictions',
    description: 'No statement that a market will, is likely to or should move in a direction.',
  },
  {
    id: 'no-suitability',
    label: 'No personal suitability',
    description: 'Nothing says an instrument, trade or strategy is right for this reader.',
  },
  {
    id: 'no-performance-promise',
    label: 'No promised returns',
    description: 'No guaranteed, risk-free or expected profit language.',
  },
  {
    id: 'no-urgency',
    label: 'No pressure to act',
    description: 'No urgency such as "act now" or "do not miss this move".',
  },
  {
    id: 'cited',
    label: 'Claims cite retrieved passages',
    description: 'Every factual answer cites at least one passage that was actually retrieved.',
  },
  {
    id: 'no-foreign-data',
    label: "No other user's data",
    description: 'No account ids, names or figures that belong to anyone other than the reader.',
  },
];

interface Rule {
  id: ComplianceCheckId;
  patterns: RegExp[];
}

const RULES: Rule[] = [
  {
    id: 'no-recommendation',
    patterns: [
      /\b(?:you\s+should|i\s+(?:would|'d)|we\s+recommend|i\s+recommend|consider)\s+(?:buy|sell|short|go\s+long|go\s+short|hold|add\s+to|close|take\s+profit)/i,
      /\b(?:good|great|strong)\s+(?:time|moment|entry|opportunity)\s+to\s+(?:buy|sell|enter)/i,
      /\b(?:buy|sell)\s+(?:now|here|the\s+dip|this)\b/i,
    ],
  },
  {
    id: 'no-price-target',
    patterns: [
      /\b(?:price\s+)?target(?:s|ing)?\s+(?:of|at|is|near)\s+\d/i,
      /\b(?:heading|headed|on\s+its\s+way)\s+(?:to|towards)\s+\d/i,
    ],
  },
  {
    id: 'no-forecast',
    patterns: [
      /\b(?:will|is\s+(?:likely|set|poised|expected)\s+to|should)\s+(?:rise|fall|rally|drop|break\s*out|bounce|climb|crash|recover|go\s+(?:up|down))/i,
      /\bbreak\s*out\s+is\s+(?:likely|coming|imminent)/i,
    ],
  },
  {
    id: 'no-suitability',
    patterns: [
      /\b(?:is|would\s+be)\s+(?:right|suitable|ideal|perfect)\s+for\s+you/i,
      /\bsuits\s+your\s+(?:portfolio|risk|goals)/i,
    ],
  },
  {
    id: 'no-performance-promise',
    patterns: [
      /\bguarantee[ds]?\b/i,
      /\brisk[-\s]?free\b/i,
      /\b(?:sure|easy|certain)\s+(?:profit|win|money)/i,
    ],
  },
  {
    id: 'no-urgency',
    patterns: [
      /\bact\s+(?:now|fast|quickly)\b/i,
      /\bdon'?t\s+miss\b/i,
      /\bbefore\s+it'?s\s+too\s+late\b/i,
      /\blimited\s+time\b/i,
    ],
  },
];

export interface CheckContext {
  /** Whether the draft is a factual answer that must carry citations. Refusals do not. */
  requiresCitations: boolean;
  citedIndexes: number[];
  retrievedIndexes: number[];
  /** Identifiers that belong to other users and must never appear, e.g. other account ids. */
  foreignIdentifiers?: string[];
}

export function citedIndexesIn(text: string): number[] {
  return [...text.matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1]));
}

export function runAdviceChecks(text: string, ctx: CheckContext): ComplianceCheckResult[] {
  return ADVICE_CHECKS.map(({ id, label }) => {
    if (id === 'cited') {
      const invalid = ctx.citedIndexes.filter((i) => !ctx.retrievedIndexes.includes(i));
      if (invalid.length > 0) {
        return {
          id,
          label,
          passed: false,
          detail: `Cites passages that were not retrieved: ${invalid.join(', ')}`,
        };
      }
      if (ctx.requiresCitations && ctx.citedIndexes.length === 0) {
        return { id, label, passed: false, detail: 'A factual answer with no citations' };
      }
      return { id, label, passed: true };
    }
    if (id === 'no-foreign-data') {
      const leaked = (ctx.foreignIdentifiers ?? []).filter((v) => v && text.includes(v));
      return leaked.length > 0
        ? {
            id,
            label,
            passed: false,
            detail: `Mentions ${leaked.length} identifier(s) from another account`,
          }
        : { id, label, passed: true };
    }
    const rule = RULES.find((r) => r.id === id);
    const hit = rule?.patterns.map((p) => p.exec(text)).find(Boolean);
    return hit
      ? { id, label, passed: false, detail: `Flagged wording: "${hit[0]}"` }
      : { id, label, passed: true };
  });
}

export function allPassed(results: ComplianceCheckResult[]): boolean {
  return results.every((r) => r.passed);
}
