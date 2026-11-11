import { z } from 'zod';
import { watchChannelSchema } from './economic';
import { deliveryChannelSchema } from './notifications';

/**
 * News the owner follows: headlines about companies and topics they name, and statements from
 * central banks. Items are passed on as published, with their source; the product adds no view.
 */

export const CENTRAL_BANKS = ['fed', 'boe', 'ecb'] as const;
export const centralBankSchema = z.enum(CENTRAL_BANKS);
export type CentralBank = z.infer<typeof centralBankSchema>;

export const CENTRAL_BANK_INFO: Record<CentralBank, { label: string; short: string }> = {
  fed: { label: 'Federal Reserve', short: 'the Fed' },
  boe: { label: 'Bank of England', short: 'the Bank of England' },
  ecb: { label: 'European Central Bank', short: 'the ECB' },
};

export const NEWS_SOURCES = ['benzinga', ...CENTRAL_BANKS] as const;
export const newsSourceSchema = z.enum(NEWS_SOURCES);
export type NewsSource = z.infer<typeof newsSourceSchema>;

export const NEWS_SOURCE_LABELS: Record<NewsSource, string> = {
  benzinga: 'Benzinga',
  fed: 'Federal Reserve',
  boe: 'Bank of England',
  ecb: 'European Central Bank',
};

/** A US-listed ticker as news feeds tag it: NVDA, BRK.B. */
export const tickerSchema = z.string().regex(/^[A-Z][A-Z0-9.]{0,9}$/);
export const newsTopicSchema = z.string().trim().min(2).max(60);

export const newsWatchSchema = z
  .object({
    tickers: z.array(tickerSchema).max(25),
    topics: z.array(newsTopicSchema).max(10),
    centralBanks: z.array(centralBankSchema).max(CENTRAL_BANKS.length),
  })
  .refine((w) => w.tickers.length + w.topics.length + w.centralBanks.length > 0, {
    message: 'Choose at least one company, topic or central bank',
  });
export type NewsWatch = z.infer<typeof newsWatchSchema>;

export const newsWatchUpdateSchema = z.object({
  watch: newsWatchSchema,
  /** When present, news alerts go to these channels from now on. */
  channels: z.array(watchChannelSchema).max(2).optional(),
});
export type NewsWatchUpdate = z.infer<typeof newsWatchUpdateSchema>;

export const newsAlertSchema = z.object({
  id: z.string().max(120),
  source: newsSourceSchema,
  headline: z.string().max(300),
  url: z.string().max(1000).optional(),
  at: z.iso.datetime(),
  /** Why it was sent: a ticker, a topic or a central bank. */
  match: z.string().max(80),
});
export type NewsAlert = z.infer<typeof newsAlertSchema>;

export const newsStateSchema = z.object({
  /** Whether Claude picks out headlines on the owner's topics (otherwise words are matched). */
  claude: z.boolean(),
  /** Whether the headline feed is set up; central bank news needs nothing. */
  headlines: z.boolean(),
  watch: newsWatchSchema.nullable(),
  /** Where news alerts go now, the app included. */
  channels: z.array(deliveryChannelSchema),
  recent: z.array(newsAlertSchema).max(30),
});
export type NewsState = z.infer<typeof newsStateSchema>;
