import type { Citation, SourceKind } from '../domain/twin';

export interface Passage {
  id: string;
  kind: SourceKind;
  title: string;
  excerpt: string;
  owner: string;
  url?: string;
  /** Days since the passage was last rebuilt or fetched. */
  ageDays: number;
}

export const LIBRARY_SIZE = 806;
export const LIBRARY_VERSION = 'lib-2026.10.28';

/**
 * A slice of the knowledge library. Studio passages come from published guides; desk passages
 * stand in for the user's own rules, trades and connected sources (synthetic demo data).
 */
const PASSAGES: Passage[] = [
  // Strategy automation
  {
    id: 'g-rules-to-ea',
    kind: 'guide',
    title: 'From written rules to an Expert Advisor',
    excerpt:
      'A rule is automatable when it can be evaluated from data the platform exposes at the moment of decision: price, indicator values, time and account state. Rules that rely on judgement are rewritten as measurable conditions or kept as manual steps.',
    owner: 'AlchmAI Playbook',
    ageDays: 12,
  },
  {
    id: 'g-mt5-options',
    kind: 'guide',
    title: 'MetaTrader 5 integration options',
    excerpt:
      'MT5 strategies run either as MQL5 Expert Advisors inside the terminal, which can be tested in the Strategy Tester, or as external processes that use the MetaTrader 5 Python package to read rates and history from a running terminal.',
    owner: 'AlchmAI Playbook',
    ageDays: 30,
  },
  {
    id: 'a-stay-manual',
    kind: 'article',
    title: 'What should stay manual in an automated strategy',
    excerpt:
      'Context read by eye, such as a reaction to news or chart structure, is the most common reason a rule cannot be automated. Traders usually keep these as alerts that bring a person in.',
    owner: 'AlchmAI Blog',
    ageDays: 41,
  },
  // Prop rules
  {
    id: 'g-breach-evidence',
    kind: 'guide',
    title: 'Breach evidence for prop firms',
    excerpt:
      'Record the rule as written with its version number, the moment the threshold was crossed and the equity at that moment. A breach record that names the rule version settles most disputes before they start.',
    owner: 'AlchmAI Playbook',
    ageDays: 8,
  },
  {
    id: 'g-drawdown-code',
    kind: 'guide',
    title: 'Drawdown rules as code',
    excerpt:
      'Evaluate drawdown on every tick against the floor, in the firm’s stated timezone, to the second. Store equity, price and open positions at the crossing so the result can be recomputed.',
    owner: 'AlchmAI Playbook',
    ageDays: 19,
  },
  {
    id: 'a-rules-in-code',
    kind: 'article',
    title: 'Why rule checks belong in code, not prompts',
    excerpt:
      'A rule engine fed with unchanged tick data gives the same result every time. A language model asked to judge a breach does not, and cannot show its working.',
    owner: 'AlchmAI Blog',
    ageDays: 55,
  },
  // Controls
  {
    id: 'g-advice-controls',
    kind: 'guide',
    title: 'Advice controls for AI features',
    excerpt:
      'Run advice checks as code after generation: recommendations, price targets, predictions, suitability, promised returns and urgency. Rewrite a failing draft once; if it fails again, withhold it and log the attempt.',
    owner: 'AlchmAI Playbook',
    ageDays: 6,
  },
  {
    id: 'g-approved-wording',
    kind: 'guide',
    title: 'Approved wording: what compliance signs',
    excerpt:
      'Compliance signs a wording list of allowed and disallowed phrasing, the checks that enforce it, the evaluation set and pass criteria, and the log retention policy.',
    owner: 'AlchmAI Playbook',
    ageDays: 14,
  },
  {
    id: 'a-numbers-from-code',
    kind: 'article',
    title: 'Numbers from code, words from the model',
    excerpt:
      'Detectors, rule engines and the ledger produce every figure. The model writes up figures it is given and is never asked to calculate.',
    owner: 'AlchmAI Blog',
    ageDays: 33,
  },
  {
    id: 'g-model-change',
    kind: 'guide',
    title: 'Changing models without surprises',
    excerpt:
      'Treat the model as configuration recorded on every answer. Re-run the agreed evaluation set before any model change goes live, and keep the advice checks independent of the model.',
    owner: 'AlchmAI Playbook',
    ageDays: 21,
  },
  {
    id: 'g-consumer-duty',
    kind: 'guide',
    title: 'Consumer Duty and AI features',
    excerpt:
      'The FCA Consumer Duty sets four outcomes: products and services, price and value, consumer understanding and consumer support. Communications must be clear, fair and not misleading, and firms are expected to test that customers understand them.',
    owner: 'AlchmAI Playbook',
    ageDays: 27,
  },
  {
    id: 'a-supervisor-evidence',
    kind: 'article',
    title: 'Evidence a supervisor will ask for',
    excerpt:
      'Keep the wording rules each summary follows, the checks applied to it and a retrievable record of what each customer saw, by answer id.',
    owner: 'AlchmAI Blog',
    ageDays: 48,
  },
  // Platform twin
  {
    id: 's-platform-twin',
    kind: 'service',
    title: 'Twin in your platform',
    excerpt:
      'The twin answers each client from their own account and the firm’s rules, in wording the compliance lead approved, and prepares support replies for staff to send. Client data is separated in the data layer.',
    owner: 'AlchmAI Services',
    url: 'https://www.alchmai.com/desk-twin',
    ageDays: 3,
  },
  {
    id: 's-studio',
    kind: 'service',
    title: 'What AlchmAI builds',
    excerpt:
      'AI chart analysis, trading charts, trading automation, AI assistants and agents, controls for AI features, and platform, FIX and market data work for brokers, prop firms, traders and educators.',
    owner: 'AlchmAI Services',
    url: 'https://www.alchmai.com/desk-twin',
    ageDays: 3,
  },
  // The user's own desk (synthetic)
  {
    id: 'r-rules-v3',
    kind: 'rule',
    title: 'Your trading rules, version 3',
    excerpt:
      'Rule 1: daily loss limit 5% of starting equity. Rule 2: trade the London session only, 07:00 to 16:30. Rule 3: no more than 3 trades per session. Rule 4: no new trades in the 10 minutes either side of a high-impact release.',
    owner: 'Your rules',
    ageDays: 16,
  },
  {
    id: 'r-daily-limit',
    kind: 'rule',
    title: 'Daily loss limit, rule version 3',
    excerpt: 'The daily loss limit is 5% of the day’s starting equity and resets at 22:00 UK time.',
    owner: 'Firm rules',
    ageDays: 16,
  },
  {
    id: 'r-max-dd',
    kind: 'rule',
    title: 'Maximum drawdown rule, version 3',
    excerpt:
      'An account is closed when equity falls below the floor, set at 10% below the starting balance. Disputes follow section 7 of the rules.',
    owner: 'Firm rules',
    ageDays: 16,
  },
  {
    id: 'acc-snapshot',
    kind: 'account',
    title: 'Account 4471, live equity snapshot',
    excerpt:
      'Daily loss used 1.4% of 5%. Equity 2.1% below peak. Maximum drawdown 10%. Snapshot taken 2 minutes ago.',
    owner: 'MetaTrader 5 export',
    ageDays: 0,
  },
  {
    id: 'acc-breach',
    kind: 'account',
    title: 'Breach record BR-20391',
    excerpt:
      'Maximum drawdown crossed at 14:02:17 UK time under rule version 3. Equity £89,996 against a floor of £90,000. Positions and tick data attached.',
    owner: 'Rule engine',
    ageDays: 1,
  },
  {
    id: 't-yesterday',
    kind: 'trade',
    title: 'MetaTrader 5 export, yesterday',
    excerpt: 'Four closed trades: EURUSD 08:14, GBPUSD 10:02, XAUUSD 13:41, EURUSD 16:42.',
    owner: 'MetaTrader 5 export',
    ageDays: 0,
  },
  {
    id: 't-week',
    kind: 'trade',
    title: 'MetaTrader 5 export, this week',
    excerpt: 'Seventeen closed trades between Monday and Friday across EURUSD, GBPUSD and XAUUSD.',
    owner: 'MetaTrader 5 export',
    ageDays: 0,
  },
  {
    id: 'cal-today',
    kind: 'calendar',
    title: 'Economic calendar, today',
    excerpt:
      'Five scheduled releases for GBP, EUR and USD with times, previous figures and consensus.',
    owner: 'Economic calendar provider',
    ageDays: 0,
  },
  {
    id: 't-watchlist',
    kind: 'trade',
    title: 'MetaTrader 5 watchlist',
    excerpt: 'EURUSD, GBPUSD, XAUUSD, US500.',
    owner: 'MetaTrader 5 export',
    ageDays: 0,
  },
  {
    id: 'chart-eurusd',
    kind: 'trade',
    title: 'EURUSD H1, last 48 bars (detector output)',
    excerpt:
      'Range 1.0848 to 1.0904 held for 48 bars. Lower edge touched 3 times. Latest bar volume 2.1 times the 20-bar average.',
    owner: 'Chart detector v2.4',
    ageDays: 0,
  },
  {
    id: 'r-payout-v5',
    kind: 'rule',
    title: 'Payout rules, version 5',
    excerpt:
      'Six conditions: minimum 5 trading days, profit target met, no breach in the period, consistency rule under 40%, KYC current, request within the payout window.',
    owner: 'Firm rules',
    ageDays: 9,
  },
  {
    id: 'acc-10482',
    kind: 'account',
    title: 'Account 10482, payout period',
    excerpt:
      '11 trading days, target met, no breaches, best day 28% of profit, KYC verified, request on day 2 of the window.',
    owner: 'Rule engine',
    ageDays: 0,
  },
  {
    id: 'n-eurusd-1',
    kind: 'news',
    title: 'Euro area flash inflation due at 10:00',
    excerpt:
      'The flash estimate for October is scheduled for 10:00 UK time. The previous reading was 2.1%.',
    owner: 'Sample Newswire',
    ageDays: 0,
  },
  {
    id: 'n-eurusd-2',
    kind: 'news',
    title: 'ECB speakers scheduled this afternoon',
    excerpt:
      'Two Governing Council members are due to speak at separate events from 14:00 UK time.',
    owner: 'Sample Newswire',
    ageDays: 0,
  },
  {
    id: 'n-eurusd-3',
    kind: 'news',
    title: 'US core PCE at 13:30',
    excerpt:
      'The September core PCE price index is due at 13:30 UK time; consensus is 0.3% month on month.',
    owner: 'Sample Newswire',
    ageDays: 0,
  },
  {
    id: 'n-eurusd-4',
    kind: 'news',
    title: 'Euro area bank lending survey published',
    excerpt:
      'The quarterly survey reported tighter credit standards for firms and steady demand for mortgages.',
    owner: 'Sample Newswire',
    ageDays: 0,
  },
];

const BY_ID = new Map(PASSAGES.map((p) => [p.id, p]));

export function toCitations(ids: string[], now: number = Date.now()): Citation[] {
  return ids.map((id, i) => {
    const p = BY_ID.get(id);
    if (!p) throw new Error(`Unknown passage ${id}`);
    return {
      index: i + 1,
      sourceId: p.id,
      kind: p.kind,
      title: p.title,
      excerpt: p.excerpt,
      url: p.url,
      owner: p.owner,
      updatedAt: new Date(now - p.ageDays * 86_400_000 - (i + 1) * 3_600_000).toISOString(),
      score: Math.max(0.55, 0.96 - i * 0.07),
    };
  });
}
