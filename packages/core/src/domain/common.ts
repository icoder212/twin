import { z } from 'zod';

/** ISO-8601 timestamp, with `Z` or an explicit offset. */
export const isoDateTimeSchema = z.iso.datetime({ offset: true });

/** Opaque identifier. Restricted alphabet so ids are safe in URLs, logs and DOM attributes. */
export const idSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'Invalid identifier');

/** `#rgb`, `#rrggbb` or `#rrggbbaa`. Anything else is rejected so tenant themes cannot inject CSS. */
export const hexColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'Expected a hex colour');

export const severitySchema = z.enum(['info', 'warning', 'critical']);
export type Severity = z.infer<typeof severitySchema>;

export const toneSchema = z.enum(['neutral', 'brand', 'success', 'warning', 'danger', 'info']);
export type Tone = z.infer<typeof toneSchema>;

export interface Page<T> {
  items: T[];
  total: number;
}
