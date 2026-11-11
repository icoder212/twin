import { z } from 'zod';

/**
 * Build-time configuration, validated once at startup. Only public values belong here: anything
 * prefixed VITE_ is compiled into the bundle and readable by every user.
 */
const envSchema = z
  .object({
    VITE_API_MODE: z.enum(['mock', 'http']).default('mock'),
    VITE_API_BASE_URL: z
      .url()
      .optional()
      .or(z.literal('').transform(() => undefined)),
    VITE_DEMO_MODE: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => v === 'true'),
    VITE_DEFAULT_TENANT: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .default('alchmai'),
    /** SHA-256 (hex) of the demo password, to change it without a code change. */
    VITE_DEMO_PASSWORD_SHA256: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .optional()
      .or(z.literal('').transform(() => undefined)),
    /** OAuth client for the demo's browser-held Google Calendar access. Public by design. */
    VITE_GOOGLE_CLIENT_ID: z
      .string()
      .regex(/^[\w-]+\.apps\.googleusercontent\.com$/)
      .optional()
      .or(z.literal('').transform(() => undefined)),
  })
  .superRefine((env, ctx) => {
    if (env.VITE_API_MODE === 'http' && !env.VITE_API_BASE_URL) {
      ctx.addIssue({
        code: 'custom',
        message: 'VITE_API_BASE_URL is required when VITE_API_MODE=http',
      });
    }
  });

const parsed = envSchema.parse(import.meta.env);

/**
 * The demo password, as a one-way hash: the code is public, so the password itself is kept out
 * of it and given to people directly. Changed on 11 November 2026.
 */
const DEMO_PASSWORD_SHA256 = 'a916744fae43a3c352e8a7c0fe25a5d90e766a62b5c7bd16a407b6ad3252c067';

export const env = {
  apiMode: parsed.VITE_API_MODE,
  apiBaseUrl: parsed.VITE_API_BASE_URL,
  /** Demo affordances: sample credentials, white-label switcher, reset demo data. */
  demoMode: parsed.VITE_API_MODE === 'mock' || parsed.VITE_DEMO_MODE,
  defaultTenant: parsed.VITE_DEFAULT_TENANT,
  /** Set only in demo builds: production reads calendars on the server, never in the browser. */
  googleClientId: parsed.VITE_API_MODE === 'mock' ? parsed.VITE_GOOGLE_CLIENT_ID : undefined,
  demoPasswordSha256: parsed.VITE_DEMO_PASSWORD_SHA256 ?? DEMO_PASSWORD_SHA256,
  isDev: import.meta.env.DEV,
} as const;
