/**
 * Interest rate decision days for the Bank of England and the ECB, listed like the Fed's in
 * fomc.ts because both publish them a year or more ahead (checked 13 November 2026; add the next
 * year's dates when they are published).
 */

/** bankofengland.co.uk/monetary-policy/upcoming-mpc-dates. The decision comes at 12:00 UK time. */
export const BOE_DECISION_DAYS = [
  '2026-02-05',
  '2026-03-19',
  '2026-04-30',
  '2026-06-18',
  '2026-07-30',
  '2026-09-17',
  '2026-11-05',
  '2026-12-17',
  '2027-02-04',
  '2027-03-18',
  '2027-04-29',
  '2027-06-17',
  '2027-07-29',
  '2027-09-16',
  '2027-11-04',
  '2027-12-16',
];
export const BOE_TIME = '12:00';
export const BOE_ZONE = 'Europe/London';

/**
 * ecb.europa.eu/press/calendars/mgcgc: day 2 of each monetary policy meeting. The decision comes
 * at 14:15 Frankfurt time.
 */
export const ECB_DECISION_DAYS = [
  '2026-12-17',
  '2027-02-04',
  '2027-03-18',
  '2027-04-29',
  '2027-06-10',
  '2027-07-22',
  '2027-09-09',
  '2027-10-28',
  '2027-12-16',
];
export const ECB_TIME = '14:15';
export const ECB_ZONE = 'Europe/Berlin';
