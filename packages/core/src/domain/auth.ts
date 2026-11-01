import { z } from 'zod';
import { idSchema } from './common';
import { deskTypeSchema } from './desk';

export const ROLES = ['trader', 'support', 'compliance', 'admin'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const ROLE_LABELS: Record<Role, string> = {
  trader: 'Trader',
  support: 'Support',
  compliance: 'Compliance',
  admin: 'Administrator',
};

export const userSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  email: z.email(),
  name: z.string().min(1).max(120),
  role: roleSchema,
  deskType: deskTypeSchema,
  timezone: z.string().min(1).max(64),
  /** Optional title shown under the name, e.g. "Head of Risk". */
  title: z.string().max(120).optional(),
});
export type User = z.infer<typeof userSchema>;

export const sessionSchema = z.object({
  sessionId: idSchema,
  user: userSchema,
  issuedAt: z.number().int().positive(),
  /** Absolute expiry (epoch ms). Idle timeout is enforced separately by the client and the server. */
  expiresAt: z.number().int().positive(),
  mfaVerified: z.boolean(),
  authMethod: z.enum(['password', 'sso']),
});
export type Session = z.infer<typeof sessionSchema>;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Email is too long')
  .pipe(z.email('Enter a valid work email'));

export const loginInputSchema = z.object({
  email,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password is too long'),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const mfaInputSchema = z.object({
  challengeId: idSchema,
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});
export type MfaInput = z.infer<typeof mfaInputSchema>;

export const SSO_PROVIDERS = ['microsoft', 'google', 'saml'] as const;
export const ssoProviderSchema = z.enum(SSO_PROVIDERS);
export type SsoProvider = z.infer<typeof ssoProviderSchema>;

export type LoginResult =
  | {
      status: 'mfa-required';
      challengeId: string;
      maskedDestination: string;
      method: 'totp' | 'sms';
    }
  | { status: 'authenticated'; session: Session };
