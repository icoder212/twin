import { z } from 'zod';

/**
 * The real account behind the demo: whether the owner is signed in with Google on the server,
 * and which channels the server can deliver to. Demo users never have one.
 */
export const accountStatusSchema = z.object({
  signedIn: z.boolean(),
  email: z.email().max(254).optional(),
  calendarConnected: z.boolean().optional(),
  channels: z.object({ email: z.boolean(), whatsapp: z.boolean() }).optional(),
});
export type AccountStatus = z.infer<typeof accountStatusSchema>;
