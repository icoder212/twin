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

/** An optional setting matching `pattern`; an empty value counts as unset. */
const optionalMatch = (pattern: RegExp) =>
  z
    .string()
    .regex(pattern)
    .optional()
    .or(z.literal('').transform(() => undefined));

const configSchema = z.object({
  OWNER_GOOGLE_ACCOUNT: z.email().transform((v) => v.toLowerCase()),
  GOOGLE_CLIENT_ID: z.string().regex(/^[\w-]+\.apps\.googleusercontent\.com$/),
  GOOGLE_CLIENT_SECRET: z.string().min(10),
  /** 32 random bytes, base64: seals Google tokens at rest and the sign-in state. */
  TOKEN_KEY: z.string().min(40),
  /** Which service sends WhatsApp: Meta's Cloud API directly, or Twilio. */
  WHATSAPP_PROVIDER: z.enum(['meta', 'twilio']).default('meta'),
  /**
   * Meta's Cloud API, needed when WHATSAPP_PROVIDER is meta. Provider settings are checked when
   * a message is sent, so a gap stops WhatsApp only, never email, briefs or the app.
   */
  WHATSAPP_PHONE_NUMBER_ID: optionalMatch(/^\d+$/),
  WHATSAPP_TOKEN: optionalSecret,
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
  /** Twilio: needed when WHATSAPP_PROVIDER is twilio. */
  TWILIO_ACCOUNT_SID: optionalMatch(/^AC[0-9a-f]{32}$/),
  TWILIO_AUTH_TOKEN: optionalMatch(/^[0-9a-f]{32}$/),
  /** The WhatsApp sender in international format, e.g. +14155238886 for Twilio's sandbox. */
  TWILIO_WHATSAPP_FROM: optionalMatch(/^\+[1-9]\d{7,14}$/),
  /** Twilio content templates with the same wording as the reminder and update templates. */
  TWILIO_REMINDER_CONTENT_SID: optionalMatch(/^HX[0-9a-f]{32}$/),
  TWILIO_UPDATE_CONTENT_SID: optionalMatch(/^HX[0-9a-f]{32}$/),
  /** WhatsApp stops sending once the Twilio balance is at or below this, in its currency. */
  TWILIO_MIN_BALANCE: optionalMatch(/^\d{1,6}(?:\.\d{1,2})?$/).transform((v) =>
    v === undefined ? undefined : Number(v),
  ),
  /**
   * IG's Web API, read for market move alerts: the API key and the Web API login set on IG's API
   * keys page. Prices are only ever read; no order is ever sent.
   */
  IG_API_KEY: optionalMatch(/^[0-9a-f]{40}$/),
  IG_USERNAME: optionalMatch(/^[A-Za-z0-9._-]{3,40}$/),
  IG_PASSWORD: z
    .string()
    .min(8)
    .max(100)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  /** IG's demo gateway by default: a demo login cannot reach real money. */
  IG_API_URL: z
    .enum(['https://demo-api.ig.com/gateway/deal', 'https://api.ig.com/gateway/deal'])
    .default('https://demo-api.ig.com/gateway/deal'),
  /**
   * While WhatsApp uses Twilio's test number, a daily reminder at this time (on TIMEZONE's clock)
   * asks the owner to reply so the next day's messages arrive. Unset: no reminder.
   */
  SANDBOX_REMINDER_AT: optionalMatch(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  /** Where Twilio reports delivery, e.g. https://<worker>/twilio/status. Unset: no receipts. */
  TWILIO_STATUS_CALLBACK_URL: z
    .url({ protocol: /^https$/ })
    .optional()
    .or(z.literal('').transform(() => undefined)),
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
  /**
   * Where email goes, if not the owner's Google account. Resend's test sender delivers only to the
   * address its Resend account was opened with.
   */
  EMAIL_TO: z
    .email()
    .transform((v) => v.toLowerCase())
    .optional()
    .or(z.literal('').transform(() => undefined)),
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
