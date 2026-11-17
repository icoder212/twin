import { z } from 'zod';
import { deliveryChannelSchema } from './notifications';

/**
 * What the owner's alerts have used this month: messages on each channel, what WhatsApp has cost
 * at the provider, and a monthly cap on WhatsApp messages the owner can set.
 */

export const MAX_WHATSAPP_MONTHLY_CAP = 5000;

export const whatsappCapSchema = z
  .number()
  .int()
  .min(1, 'Allow at least one message')
  .max(MAX_WHATSAPP_MONTHLY_CAP, `The cap can be up to ${MAX_WHATSAPP_MONTHLY_CAP}`);

export const channelUsageSchema = z.object({
  channel: deliveryChannelSchema,
  /** Handed to the provider, including those it later confirmed delivered or read. */
  sent: z.number().int().min(0),
  failed: z.number().int().min(0),
  /** Not sent: quiet hours, a channel not set up, or the cap reached. */
  skipped: z.number().int().min(0),
});
export type ChannelUsage = z.infer<typeof channelUsageSchema>;

export const usageSchema = z.object({
  /** The month counted, on the owner's clock, e.g. "November 2026". */
  month: z.string().max(40),
  channels: z.array(channelUsageSchema),
  whatsapp: z.object({
    /** At most this many WhatsApp messages a month; no cap when null. */
    cap: whatsappCapSchema.nullable(),
    sent: z.number().int().min(0),
    /** Spent at the provider this month, its balance and currency, when they can be read. */
    spent: z.number().nullable(),
    balance: z.number().nullable(),
    currency: z.string().max(8).nullable(),
    /** Sending stops when the balance falls to this. */
    floor: z.number().nullable(),
  }),
});
export type Usage = z.infer<typeof usageSchema>;

export const usageCapUpdateSchema = z.object({ whatsappCap: whatsappCapSchema.nullable() });
export type UsageCapUpdate = z.infer<typeof usageCapUpdateSchema>;
