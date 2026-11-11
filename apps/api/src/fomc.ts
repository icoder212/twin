import { getText, parseRss } from './rss';

/**
 * The Fed's interest rate decisions. Meeting dates are published a year or more ahead, so they are
 * listed here: the last day of each meeting, from federalreserve.gov/monetarypolicy/fomccalendars.htm
 * (checked 10 November 2026; add the next year's dates when they are published). The statement
 * comes at 14:00 New York time and is read from the Fed's own press release feed.
 */
export const FOMC_DECISION_DAYS = [
  '2026-01-28',
  '2026-03-18',
  '2026-04-29',
  '2026-06-17',
  '2026-07-29',
  '2026-09-16',
  '2026-10-28',
  '2026-12-09',
  '2027-01-27',
  '2027-03-17',
  '2027-04-28',
  '2027-06-09',
  '2027-07-28',
  '2027-09-15',
  '2027-10-27',
  '2027-12-08',
];

export const FOMC_TIME = '14:00';

export const FED_FEED = 'https://www.federalreserve.gov/feeds/press_monetary.xml';
export const FED_PRESS_RELEASES = 'https://www.federalreserve.gov/newsevents/pressreleases/';
/** How far from the scheduled time a statement still counts as this meeting's. */
const MATCH_WINDOW_MS = 12 * 3_600_000;

/** "3-3/4" is 3.75, "1/4" is 0.25, "4" is 4. */
export function fedNumber(value: string): number | null {
  const match = /^(?:(\d+)(?:-(\d)\/(\d))?|(\d)\/(\d))$/.exec(value);
  if (!match) return null;
  if (match[4] && match[5]) return Number(match[4]) / Number(match[5]);
  const whole = Number(match[1]);
  return match[2] && match[3] ? whole + Number(match[2]) / Number(match[3]) : whole;
}

const NUMBER = String.raw`\d+(?:-\d\/\d)?|\d\/\d`;
const DECISION = new RegExp(
  String.raw`decided to (maintain|lower|raise) the target range for the federal funds rate` +
    String.raw`(?: by (${NUMBER}) percentage points?)? (?:at|to) (${NUMBER}) to (${NUMBER}) percent`,
  'i',
);

export interface FomcResult {
  body: string;
  short: string;
}

const percent = (n: number) => `${n.toFixed(2)}%`;
const CHANGE: Record<string, string> = { maintain: 'kept', lower: 'lowered', raise: 'raised' };

/** The decision as the statement words it, in plain figures. Null if the wording is new. */
export function readDecision(statement: string): FomcResult | null {
  const text = statement
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/\s+/g, ' ');
  const match = DECISION.exec(text);
  if (!match) return null;
  const [, verb = '', by, low = '', high = ''] = match;
  const change = CHANGE[verb.toLowerCase()];
  const from = fedNumber(low);
  const to = fedNumber(high);
  if (!change || from === null || to === null) return null;
  const step = by ? fedNumber(by) : null;
  const moved =
    change !== 'kept' && step !== null ? ` by ${step.toFixed(2)} percentage points` : '';
  const outcome = `${change}${moved}, ${change === 'kept' ? 'at' : 'to'} ${percent(from)} to ${percent(to)}`;
  return {
    body: `The target range for the federal funds rate was ${outcome}.`,
    short: `target range ${outcome}`,
  };
}

/**
 * The decision for the meeting due at `at`, once its statement is in the Fed's feed. If the
 * wording cannot be read, says the statement is out rather than guessing.
 */
export async function fomcResult(at: number, fetchFn: typeof fetch): Promise<FomcResult | null> {
  const items = parseRss(await getText(FED_FEED, fetchFn), FED_PRESS_RELEASES);
  const statement = items.find(
    (i) => /FOMC statement/i.test(i.title) && Math.abs(i.at - at) <= MATCH_WINDOW_MS,
  );
  if (!statement) return null;
  const decision = readDecision(await getText(statement.link, fetchFn));
  return (
    decision ?? {
      body: 'The FOMC statement has been published on federalreserve.gov.',
      short: 'the statement has been published on federalreserve.gov',
    }
  );
}
