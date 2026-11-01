import { z } from 'zod';
import { hexColorSchema, idSchema } from './common';
import { ssoProviderSchema } from './auth';

/**
 * Semantic colour tokens. Every client (web, mobile, embed) maps these onto its own styling
 * system, so a white-label brand is defined once and renders consistently everywhere.
 */
export const themeTokensSchema = z.object({
  bg: hexColorSchema,
  surface: hexColorSchema,
  surface2: hexColorSchema,
  surface3: hexColorSchema,
  line: hexColorSchema,
  lineStrong: hexColorSchema,
  fg: hexColorSchema,
  fgMuted: hexColorSchema,
  fgSubtle: hexColorSchema,
  /** Fill for primary actions. Must reach 4.5:1 against `onBrand`. */
  brand: hexColorSchema,
  /** Brand colour for text and icons on surfaces. Must reach 4.5:1 against `surface`. */
  brandFg: hexColorSchema,
  onBrand: hexColorSchema,
  accent: hexColorSchema,
  success: hexColorSchema,
  warning: hexColorSchema,
  danger: hexColorSchema,
  info: hexColorSchema,
});
export type ThemeTokens = z.infer<typeof themeTokensSchema>;
export type ThemeTokenName = keyof ThemeTokens;

export const colorSchemeSchema = z.enum(['dark', 'light']);
export type ColorScheme = z.infer<typeof colorSchemeSchema>;
export const colorSchemePreferenceSchema = z.enum(['dark', 'light', 'system']);
export type ColorSchemePreference = z.infer<typeof colorSchemePreferenceSchema>;

/** Only same-origin paths or https URLs are accepted for brand assets. */
const assetUrlSchema = z
  .string()
  .max(2048)
  .refine((v) => /^\/(?!\/)[\w\-./]*$/.test(v) || /^https:\/\/[^\s"'<>]+$/.test(v), {
    message: 'Asset URL must be a same-origin path or an https URL',
  });

const httpsOriginSchema = z
  .string()
  .regex(/^https:\/\/[a-z0-9.-]+(?::\d{1,5})?$/i, 'Expected an https origin')
  .or(z.string().regex(/^http:\/\/localhost(?::\d{1,5})?$/, 'Expected an https origin'));

export const FEATURE_KEYS = [
  'twin',
  'tasks',
  'workflows',
  'shortcuts',
  'alerts',
  'approvals',
  'sources',
  'audit',
] as const;
export const featureKeySchema = z.enum(FEATURE_KEYS);
export type FeatureKey = z.infer<typeof featureKeySchema>;

export const tenantConfigSchema = z.object({
  id: idSchema,
  /** Legal or trading name of the firm. */
  name: z.string().min(1).max(80),
  /** What the assistant is called inside this tenant, e.g. "Desk Twin" or "Northbridge Assist". */
  productName: z.string().min(1).max(40),
  tagline: z.string().max(160),
  brand: z.object({
    /** Short wordmark text shown when no logo asset is supplied. Also the logo's alt text. */
    wordmark: z.string().min(1).max(24),
    /** Highlighted suffix of the wordmark, e.g. the "AI" in "AlchmAI". */
    wordmarkAccent: z.string().max(12).optional(),
    /** Square brand mark shown beside the wordmark, and alone where space is tight. */
    markUrl: assetUrlSchema.optional(),
    /** Full logo (mark and name). Replaces the mark and wordmark text where it is supplied. */
    logo: z
      .object({
        /** Version for dark backgrounds, usually with light lettering. */
        onDark: assetUrlSchema,
        /** Version for light backgrounds. */
        onLight: assetUrlSchema,
        /** Width divided by height, so the layout does not shift while the image loads. */
        aspectRatio: z.number().min(1).max(10),
      })
      .optional(),
    /** Use the gradient wave artwork on the sign-in screen. */
    heroArt: z.boolean().default(true),
  }),
  theme: z.object({
    defaultScheme: colorSchemePreferenceSchema.default('system'),
    /** Corner radius scale multiplier: 0.5 is sharper, 1.25 is rounder. */
    radiusScale: z.number().min(0).max(2).default(1),
    dark: themeTokensSchema,
    light: themeTokensSchema,
  }),
  features: z.record(featureKeySchema, z.boolean()),
  security: z.object({
    idleTimeoutMinutes: z.number().int().min(1).max(240),
    /** Warning shown this many seconds before the idle timeout signs the user out. */
    idleWarningSeconds: z.number().int().min(10).max(600),
    absoluteSessionHours: z.number().int().min(1).max(24),
    mfaRequired: z.boolean(),
    ssoProviders: z.array(ssoProviderSchema),
    maxLoginAttempts: z.number().int().min(3).max(10),
  }),
  locale: z.object({
    language: z.string().min(2).max(16),
    currency: z.string().length(3),
    timezone: z.string().min(1).max(64),
  }),
  legal: z.object({
    disclaimer: z.string().max(400),
    supportEmail: z.email(),
    privacyUrl: assetUrlSchema.optional(),
    termsUrl: assetUrlSchema.optional(),
  }),
  embed: z.object({
    /** Host origins allowed to frame the app and exchange postMessage events with it. */
    allowedOrigins: z.array(httpsOriginSchema).max(20),
  }),
});
export type TenantConfig = z.infer<typeof tenantConfigSchema>;

export function isFeatureEnabled(tenant: TenantConfig, feature: FeatureKey): boolean {
  return tenant.features[feature] ?? false;
}
