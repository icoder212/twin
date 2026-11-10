import { z } from 'zod';
import type { D1Database } from './worker-types';

/** Bindings and settings. Anything specific to one deployment is a secret, never committed. */
export interface Env {
  DB: D1Database;
  [setting: string]: unknown;
}

const optionalSecret = z
  .string()
  .min(16)
  .optional()
  .or(z.literal('').transform(() => undefined));

const configSchema = z.object({
  OWNER_GOOGLE_ACCOUNT: z.email().transform((v) => v.toLowerCase()),
  GOOGLE_CLIENT_ID: z.string().regex(/^[\w-]+\.apps\.googleusercontent\.com$/),
  GOOGLE_CLIENT_SECRET: z.string().min(10),
  /** 32 random bytes, base64: seals Google tokens at rest and the sign-in state. */
  TOKEN_KEY: z.string().min(40),
  WHATSAPP_PHONE_NUMBER_ID: z.string().regex(/^\d+$/),
  WHATSAPP_TOKEN: z.string().min(20),
  /** Both needed only for delivery receipts; without them the webhook stays switched off. */
  WHATSAPP_APP_SECRET: optionalSecret,
  WHATSAPP_VERIFY_TOKEN: optionalSecret,
  /** International format, digits only, e.g. 447700900123. */
  WHATSAPP_TO: z.string().regex(/^\d{8,15}$/),
  WHATSAPP_TEMPLATE: z.string().regex(/^[a-z0-9_]+$/),
  WHATSAPP_TEMPLATE_LANGUAGE: z.string().regex(/^[a-z]{2}(?:_[A-Z]{2})?$/),
  GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/),
  REMINDER_MINUTES: z.coerce.number().int().min(1).max(120),
  TIMEZONE: z.string().min(1),
});
export type Config = z.infer<typeof configSchema>;

/** Validates every setting at once. The error names missing settings, never their values. */
export function readConfig(env: Env): Config {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((i) => i.path.join('.')))];
    throw new Error(`Missing or invalid settings: ${names.join(', ')}`);
  }
  return parsed.data;
}
