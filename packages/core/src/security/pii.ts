/**
 * Detects personal, account and secret data in text before it leaves the device. Matches are
 * validated (Luhn for cards, mod-97 for IBANs) to keep false positives low enough that users
 * trust the warning.
 */

export type PiiKind =
  | 'card'
  | 'iban'
  | 'uk-bank-account'
  | 'email'
  | 'phone'
  | 'national-insurance'
  | 'secret'
  | 'password';

export interface PiiMatch {
  kind: PiiKind;
  start: number;
  end: number;
  /** Safe-to-display description, never the raw value. */
  label: string;
}

export const PII_LABELS: Record<PiiKind, string> = {
  card: 'Card number',
  iban: 'IBAN',
  'uk-bank-account': 'Sort code and account',
  email: 'Email address',
  phone: 'Phone number',
  'national-insurance': 'National Insurance number',
  secret: 'API key or token',
  password: 'Password',
};

interface Detector {
  kind: PiiKind;
  pattern: RegExp;
  validate?: (raw: string) => boolean;
}

function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function passesLuhn(raw: string): boolean {
  const digits = digitsOnly(raw);
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export function isValidIban(raw: string): boolean {
  const iban = raw.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const value = ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of value) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

const DETECTORS: Detector[] = [
  {
    kind: 'password',
    pattern: /\b(?:password|passcode|passwd|pwd|pin)\s*(?:is|:|=)\s*\S+/gi,
  },
  {
    kind: 'secret',
    pattern:
      /\b(?:sk|pk|rk)[-_](?:live|test|ant|proj)?[-_]?[A-Za-z0-9_-]{16,}\b|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
  {
    kind: 'iban',
    pattern: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?\b/g,
    validate: isValidIban,
  },
  { kind: 'card', pattern: /\b(?:\d[ -]?){12,18}\d\b/g, validate: passesLuhn },
  { kind: 'uk-bank-account', pattern: /\b\d{2}-\d{2}-\d{2}\s*,?\s*\d{8}\b/g },
  {
    kind: 'national-insurance',
    pattern: /\b(?!BG|GB|NK|KN|TN|NT|ZZ)[A-CEGHJ-PR-TW-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/gi,
  },
  { kind: 'email', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  {
    // International (+44 ...) or trunk-prefixed (07..., 020...) numbers, not part of a longer digit run.
    kind: 'phone',
    pattern:
      /(?<![\d+])(?:\+\d{1,3}[\s-]?(?:\(0\)\s?)?|0)\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4}(?![\s-]?\d)/g,
  },
];

function overlaps(a: PiiMatch, b: PiiMatch): boolean {
  return a.start < b.end && b.start < a.end;
}

export function detectPii(text: string): PiiMatch[] {
  const found: PiiMatch[] = [];
  for (const detector of DETECTORS) {
    for (const match of text.matchAll(detector.pattern)) {
      const raw = match[0];
      const start = match.index;
      if (detector.validate && !detector.validate(raw)) continue;
      // Phone numbers need at least 10 digits to avoid matching prices, times and account ids.
      if (detector.kind === 'phone' && digitsOnly(raw).length < 10) continue;
      const candidate: PiiMatch = {
        kind: detector.kind,
        start,
        end: start + raw.length,
        label: PII_LABELS[detector.kind],
      };
      // Earlier detectors are more specific, so they win when two matches overlap.
      if (!found.some((existing) => overlaps(existing, candidate))) found.push(candidate);
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

function maskFor(kind: PiiKind, raw: string): string {
  if (kind === 'card') return `[card ending ${digitsOnly(raw).slice(-4)}]`;
  if (kind === 'iban') return `[IBAN ending ${raw.replace(/\s+/g, '').slice(-4)}]`;
  return `[${PII_LABELS[kind].toLowerCase()} removed]`;
}

export function redactPii(text: string, matches: PiiMatch[] = detectPii(text)): string {
  let out = '';
  let cursor = 0;
  for (const m of matches) {
    out += text.slice(cursor, m.start) + maskFor(m.kind, text.slice(m.start, m.end));
    cursor = m.end;
  }
  return out + text.slice(cursor);
}
