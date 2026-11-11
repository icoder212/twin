import { z } from 'zod';
import { deliveryChannelSchema } from './notifications';

/**
 * US economic releases the owner can watch: a reminder before each one and, afterwards, the
 * figures as published. Facts only: no forecasts, consensus figures or views on what they mean.
 */

export const US_RELEASES = [
  'fomc',
  'cpi',
  'jobs',
  'gdp',
  'pce',
  'retail-sales',
  'ppi',
  'jobless-claims',
  'jolts',
] as const;
export const usReleaseSchema = z.enum(US_RELEASES);
export type UsRelease = z.infer<typeof usReleaseSchema>;

export const US_RELEASE_INFO: Record<
  UsRelease,
  { label: string; short: string; source: string; major: boolean }
> = {
  fomc: {
    label: 'Fed interest rate decision (FOMC)',
    short: 'FOMC decision',
    source: 'Federal Reserve',
    major: true,
  },
  cpi: {
    label: 'Consumer prices (CPI)',
    short: 'US CPI',
    source: 'US Bureau of Labor Statistics',
    major: true,
  },
  jobs: {
    label: 'Jobs report (non-farm payrolls)',
    short: 'US jobs report',
    source: 'US Bureau of Labor Statistics',
    major: true,
  },
  gdp: {
    label: 'GDP',
    short: 'US GDP',
    source: 'US Bureau of Economic Analysis',
    major: true,
  },
  pce: {
    label: 'PCE prices',
    short: 'US PCE prices',
    source: 'US Bureau of Economic Analysis',
    major: true,
  },
  'retail-sales': {
    label: 'Retail sales',
    short: 'US retail sales',
    source: 'US Census Bureau',
    major: true,
  },
  ppi: {
    label: 'Producer prices (PPI)',
    short: 'US PPI',
    source: 'US Bureau of Labor Statistics',
    major: false,
  },
  'jobless-claims': {
    label: 'Weekly jobless claims',
    short: 'US jobless claims',
    source: 'US Department of Labor',
    major: false,
  },
  jolts: {
    label: 'Job openings (JOLTS)',
    short: 'US job openings',
    source: 'US Bureau of Labor Statistics',
    major: false,
  },
};

/** What "major US releases" means everywhere in the product. */
export const MAJOR_US_RELEASES: UsRelease[] = US_RELEASES.filter((e) => US_RELEASE_INFO[e].major);

/** Reminder lead times offered in the app; instructions may ask for any up to a day. */
export const REMIND_MINUTE_CHOICES = [0, 5, 10, 15, 30, 60, 120] as const;

/** Times offered for the summary of the next day's releases, on the owner's clock. */
export const SUMMARY_TIME_CHOICES = ['07:00', '17:00', '18:00', '19:00', '20:00', '21:00'] as const;

export const economicWatchSchema = z
  .object({
    events: z.array(usReleaseSchema).min(1).max(US_RELEASES.length),
    /** Minutes before each release; 0 sends no reminder. */
    remindMinutes: z.number().int().min(0).max(1440),
    /** Whether the published figures follow each release. */
    results: z.boolean(),
    /** When to send a summary of the next day's releases, 24-hour clock. Absent: none. */
    summaryAt: z
      .string()
      .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
  })
  .refine((w) => w.remindMinutes > 0 || w.results || w.summaryAt !== undefined, {
    message: 'Choose a summary, a reminder, the figures afterwards, or any of them',
  });
export type EconomicWatch = z.infer<typeof economicWatchSchema>;

/** Channels besides the app; the app always gets every alert. */
export const watchChannelSchema = z.enum(['email', 'whatsapp']);
export type WatchChannel = z.infer<typeof watchChannelSchema>;

export const economicWatchUpdateSchema = z.object({
  watch: economicWatchSchema,
  /** When present, economic releases go to these channels from now on. */
  channels: z.array(watchChannelSchema).max(2).optional(),
});
export type EconomicWatchUpdate = z.infer<typeof economicWatchUpdateSchema>;

export const economicReleaseStatusSchema = z.enum([
  'upcoming',
  'waiting',
  'published',
  'missed',
  'past',
]);
export type EconomicReleaseStatus = z.infer<typeof economicReleaseStatusSchema>;

export const economicReleaseSchema = z.object({
  key: z.string().max(80),
  event: usReleaseSchema,
  at: z.iso.datetime(),
  status: economicReleaseStatusSchema,
  /** The figures as posted, once published. */
  details: z.string().max(400).optional(),
});
export type EconomicRelease = z.infer<typeof economicReleaseSchema>;

export const economicStateSchema = z.object({
  /** Whether this server can read instructions with Claude. */
  claude: z.boolean(),
  /** Whether release dates can be fetched; only the Fed decision is scheduled without it. */
  fred: z.boolean(),
  watch: economicWatchSchema.nullable(),
  /** Where economic releases go now, the app included. */
  channels: z.array(deliveryChannelSchema),
  upcoming: z.array(economicReleaseSchema).max(40),
});
export type EconomicState = z.infer<typeof economicStateSchema>;
