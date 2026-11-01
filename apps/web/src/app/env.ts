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

export const env = {
  apiMode: parsed.VITE_API_MODE,
  apiBaseUrl: parsed.VITE_API_BASE_URL,
  /** Demo affordances: sample credentials, white-label switcher, reset demo data. */
  demoMode: parsed.VITE_API_MODE === 'mock' || parsed.VITE_DEMO_MODE,
  defaultTenant: parsed.VITE_DEFAULT_TENANT,
  isDev: import.meta.env.DEV,
} as const;
