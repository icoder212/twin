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
  /** "Desk Twin update on {{1}}: {{2}}. Full details are in the app." Unset: no WhatsApp copy. */
  WHATSAPP_UPDATE_TEMPLATE: z
    .string()
    .regex(/^[a-z0-9_]+$/)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  WHATSAPP_TEMPLATE_LANGUAGE: z.string().regex(/^[a-z]{2}(?:_[A-Z]{2})?$/),
  GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/),
  REMINDER_MINUTES: z.coerce.number().int().min(1).max(120),
  TIMEZONE: z.string().min(1),
  /** Sites allowed to sign in here, comma-separated, e.g. https://twin.alchmai.com. */
  APP_ORIGINS: z
    .string()
    .transform((v) =>
      v
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.url()).min(1)),
  /** Resend API key; without it email is reported as not set up. */
  RESEND_API_KEY: optionalSecret,
  /** Sender, e.g. "Desk Twin <onboarding@resend.dev>" (Resend's test sender reaches only you). */
  RESEND_FROM: z.string().min(3),
  /** Claude reads the owner's instructions; without a key the app offers the settings instead. */
  ANTHROPIC_API_KEY: optionalSecret,
  CLAUDE_MODEL: z.string().regex(/^claude-[a-z0-9-]+$/),
  /** Picks out headlines on the owner's topics: a small, fast model keeps this to pennies a day. */
  CLAUDE_FILTER_MODEL: z.string().regex(/^claude-[a-z0-9-]+$/),
  /** BLS key, free: CPI, PPI, jobs and job openings straight from the source, at release time. */
  BLS_API_KEY: z
    .string()
    .regex(/^[A-Za-z0-9]{20,64}$/)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  /** Alpaca market data keys (free account): Benzinga headlines. Both or neither. */
  ALPACA_KEY_ID: optionalSecret,
  ALPACA_SECRET_KEY: optionalSecret,
  /** St. Louis Fed (FRED) key, free: US release dates and published figures. */
  FRED_API_KEY: z
    .string()
    .regex(/^[a-z0-9]{32}$/)
    .optional()
    .or(z.literal('').transform(() => undefined)),
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
