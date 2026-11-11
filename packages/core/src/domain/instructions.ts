import { z } from 'zod';
import { economicWatchSchema, watchChannelSchema } from './economic';
import { newsWatchSchema } from './news';

/** One instruction in the owner's words, read by Claude on the server. */
export const instructionRequestSchema = z.object({
  text: z.string().trim().min(3).max(600),
});

const message = z.string().min(1).max(600);
export const watchKindSchema = z.enum(['economic', 'news']);
export type WatchKind = z.infer<typeof watchKindSchema>;

/** What Claude understood. Nothing is saved until the owner confirms in the app. */
export const instructionReplySchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('proposal'),
      message,
      watch: economicWatchSchema.optional(),
      channels: z.array(watchChannelSchema).max(2).optional(),
      news: newsWatchSchema.optional(),
      newsChannels: z.array(watchChannelSchema).max(2).optional(),
      /** Watches the same instruction asks to stop. */
      stop: z.array(watchKindSchema).max(2).optional(),
    })
    .refine((p) => p.watch !== undefined || p.news !== undefined, {
      message: 'A proposal changes at least one watch',
    }),
  z.object({ kind: z.literal('stop'), message, what: z.array(watchKindSchema).min(1).max(2) }),
  z.object({ kind: z.literal('reply'), message }),
]);
export type InstructionReply = z.infer<typeof instructionReplySchema>;
