import { z } from 'zod';

export const DESK_TYPES = [
  'independent-trader',
  'prop-firm',
  'broker',
  'trading-education',
  'fintech-engineering',
  'research-quant',
] as const;

export const deskTypeSchema = z.enum(DESK_TYPES);
export type DeskType = z.infer<typeof deskTypeSchema>;

export const DESK_LABELS: Record<DeskType, { short: string; long: string }> = {
  'independent-trader': {
    short: 'Independent traders',
    long: 'independent traders and solo founders',
  },
  'prop-firm': { short: 'Prop firms', long: 'prop trading firms and their risk teams' },
  broker: { short: 'Brokers', long: 'brokers and CFD providers' },
  'trading-education': { short: 'Trading education', long: 'trading educators and their students' },
  'fintech-engineering': {
    short: 'Fintech and engineering',
    long: 'fintech and platform engineering teams',
  },
  'research-quant': { short: 'Research and quant', long: 'research and quant teams' },
};

/** The seven specialist agents the router can pick from. */
export const SPECIALISTS = [
  'ai-analysis',
  'charts',
  'prop-rules',
  'strategy',
  'controls',
  'platforms',
  'studio',
] as const;

export const specialistSchema = z.enum(SPECIALISTS);
export type Specialist = z.infer<typeof specialistSchema>;

export const SPECIALIST_LABELS: Record<Specialist, string> = {
  'ai-analysis': 'AI analysis',
  charts: 'Charts',
  'prop-rules': 'Prop rules',
  strategy: 'Strategy',
  controls: 'Controls',
  platforms: 'Platforms',
  studio: 'Studio',
};
