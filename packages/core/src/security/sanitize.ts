/**
 * Input hygiene for free text typed by users. This is defence in depth: the UI never renders
 * user text as HTML, and the server validates again, but normalising here keeps hidden
 * characters out of prompts, logs and audit records.
 */

// C0/C1 control characters except tab (\u0009) and newline (\u000A).
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

// Bidirectional overrides and isolates ("Trojan Source"), which can make text read differently
// from how it is processed.
const BIDI_CONTROLS = /[\u202A-\u202E\u2066-\u2069\u200E\u200F\u061C]/g;

// Zero-width and invisible formatting characters often used to smuggle instructions.
const INVISIBLE = /[\u200B-\u200D\u2060-\u2064\uFEFF\u00AD]/g;

export interface SanitizeOptions {
  maxLength: number;
  /** Keep line breaks (multi-line inputs) or collapse to a single line (names, labels). */
  multiline?: boolean;
}

export function sanitizeText(
  input: string,
  { maxLength, multiline = true }: SanitizeOptions,
): string {
  let text = input.normalize('NFKC').replace(/\r\n?/g, '\n');
  text = text.replace(CONTROL_CHARS, '').replace(BIDI_CONTROLS, '').replace(INVISIBLE, '');
  text = multiline ? text.replace(/\n{3,}/g, '\n\n') : text.replace(/\s+/g, ' ');
  text = text.replace(/[ \t]{2,}/g, ' ').trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

/** True when the text contains characters that sanitisation would silently remove. */
export function hasHiddenCharacters(input: string): boolean {
  return new RegExp(`${BIDI_CONTROLS.source}|${INVISIBLE.source}`).test(input);
}

/** Escape a value for CSV so exported audit logs cannot trigger spreadsheet formula injection. */
export function toCsvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
