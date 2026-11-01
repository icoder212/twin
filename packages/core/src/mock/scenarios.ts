import type { User } from '../domain/auth';
import type { Specialist } from '../domain/desk';
import type { Alert, Approval } from '../domain/operations';
import type { ActionItem, EconomicEvent } from '../domain/overview';
import type { TenantConfig } from '../domain/tenant';
import type { AnswerBlock, AnswerStatus, DraftAttempt } from '../domain/twin';
import { formatLongDate, formatTime } from '../format/format';

export interface ScenarioContext {
  user: User;
  tenant: TenantConfig;
  now: Date;
  /** Text after a shortcut command, e.g. "EURUSD 1.0900". */
  args: string;
  question: string;
  createPriceAlert(instrument: string, level: number): Alert;
  upsertApproval(approval: Omit<Approval, 'createdAt' | 'status' | 'checks'>): Approval;
  saveNote(text: string): void;
  pendingApprovals(): Approval[];
  openActionItems(): ActionItem[];
  events(): EconomicEvent[];
}

export interface ScenarioResult {
  status: AnswerStatus;
  specialist: Specialist;
  routeReason: string;
  text: string;
  blocks?: AnswerBlock[];
  /** Passage ids, in citation order: the first is [1]. */
  passages: string[];
  requiresCitations: boolean;
  /** Earlier drafts that failed the checks, summarised. Never their text. */
  blockedDrafts?: DraftAttempt[];
}

interface QuestionScenario {
  id: string;
  /**
   * Each inner array is a group of synonyms; the score is the number of groups matched. The first
   * group is mandatory. On a tie the scenario listed first wins, so more specific scenarios come
   * before general ones.
   */
  keywords: string[][];
  minGroups: number;
  build(ctx: ScenarioContext): ScenarioResult;
}

const loc = (ctx: ScenarioContext) => ({
  ...ctx.tenant.locale,
  timezone: ctx.user.timezone || ctx.tenant.locale.timezone,
});

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export const QUESTION_SCENARIOS: QuestionScenario[] = [
  {
    id: 'mt5-automation',
    keywords: [
      ['automat', 'expert advisor', ' ea', 'bot', 'algo'],
      ['mt5', 'metatrader', 'strategy', 'mql'],
    ],
    minGroups: 2,
    build: () => ({
      status: 'answered',
      specialist: 'strategy',
      routeReason:
        'Mentions automating a MetaTrader 5 strategy, so the strategy automation specialist takes it.',
      passages: ['g-rules-to-ea', 'g-mt5-options', 'a-stay-manual'],
      requiresCitations: true,
      text: [
        'Usually, yes, as long as every decision in it can be written as a rule the platform can test. A strategy is ready to automate when each entry, exit and position-size decision uses data MetaTrader 5 exposes, such as prices, indicator values, time of day and account equity [1].',
        'On MT5 there are two common routes:',
        '- An **Expert Advisor** written in MQL5, which runs inside the terminal and can be tested in the Strategy Tester [2].',
        '- An **external Python process** using the MetaTrader 5 package, which reads prices and history from a running terminal [2].',
        'The usual first step is a rule review. Each judgement call is either turned into a measurable condition or kept as a manual step with an alert [1]. Parts that depend on reading news or chart context by eye are the hardest to automate, and are often kept as alerts that bring you in [3].',
      ].join('\n\n'),
    }),
  },
  {
    id: 'drawdown-breach',
    keywords: [
      ['breach', 'drawdown'],
      ['prove', 'evidence', 'record', 'show', 'dispute'],
    ],
    minGroups: 2,
    build: () => ({
      status: 'answered',
      specialist: 'prop-rules',
      routeReason:
        'A question about evidencing a drawdown breach goes to the prop firm rules specialist.',
      passages: ['g-breach-evidence', 'g-drawdown-code', 'a-rules-in-code'],
      requiresCitations: true,
      text: [
        'By recording it as it happens: the rule, its version, the time and the equity at the breach, checked on every tick [1].',
        'A breach record that holds up in a dispute has four parts:',
        '- **The rule as written**, with its version number, so you can show which wording applied on the day [1].',
        '- **The exact time** the threshold was crossed, to the second, in the firm’s stated timezone [2].',
        '- **Equity against the floor** at that moment, with the price and the open positions behind it [2].',
        '- **The tick data** around the breach, kept unchanged, so anyone can recompute the result [3].',
        'Because the check runs in a rule engine on tick data rather than in a language model, the same inputs always give the same result [3].',
      ].join('\n\n'),
    }),
  },
  {
    id: 'daily-limit',
    keywords: [['daily'], ['limit', 'loss', 'close am i', 'how much']],
    minGroups: 2,
    build: () => ({
      status: 'answered',
      specialist: 'prop-rules',
      routeReason:
        'An account question about the daily loss limit, answered from your account data and the firm rules.',
      passages: ['acc-snapshot', 'r-daily-limit'],
      requiresCitations: true,
      text: [
        'You have used **1.4%** of your **5%** daily loss limit today [1]. That leaves 3.6% before the limit is reached, and the limit resets at 22:00 UK time [2].',
        'Your maximum drawdown is 10%, and equity is currently 2.1% below its peak [1].',
      ].join('\n\n'),
      blocks: [
        {
          type: 'metrics',
          items: [
            { label: 'Daily loss used', value: '1.4%', hint: 'of 5%', tone: 'success' },
            { label: 'Headroom today', value: '3.6%', hint: 'before the limit', tone: 'neutral' },
            { label: 'Drawdown used', value: '2.1%', hint: 'of 10%', tone: 'success' },
            { label: 'Resets', value: '22:00', hint: 'UK time', tone: 'neutral' },
          ],
        },
      ],
    }),
  },
  {
    id: 'account-closed',
    keywords: [['account'], ['closed', 'breached', 'terminated', 'failed', 'shut']],
    minGroups: 2,
    build: () => ({
      status: 'answered',
      specialist: 'prop-rules',
      routeReason:
        'An account closure question, answered from the breach record and the rule that applied.',
      passages: ['r-max-dd', 'acc-breach'],
      requiresCitations: true,
      text: [
        'Your account crossed the 10% maximum drawdown at **14:02:17 UK time**, on version 3 of the rule [1]. Equity was £89,996 against a floor of £90,000 [2].',
        'The full breach record, with the positions and tick data behind it, is in your dashboard under BR-20391 [2]. If you think the record is wrong, the dispute route is set out in section 7 of the rules [1].',
      ].join('\n\n'),
    }),
  },
  {
    id: 'stop-advice',
    keywords: [
      ['stop', 'prevent', 'avoid', 'control'],
      ['advice', 'advising', 'recommend'],
    ],
    minGroups: 2,
    build: () => ({
      status: 'answered',
      specialist: 'controls',
      routeReason:
        'A question about keeping an AI feature from advising goes to the controls specialist.',
      passages: ['g-advice-controls', 'g-approved-wording', 'a-numbers-from-code'],
      requiresCitations: true,
      text: [
        'By putting the controls after the model, in code, rather than asking the model to behave [1].',
        'In practice that means:',
        '- **An approved wording list** your compliance lead signs, with phrasing that is allowed and phrasing that is not [2].',
        '- **Checks on every draft** for recommendations, targets, predictions, suitability claims, promised returns and urgency [1].',
        '- **One rewrite** for a draft that fails. If the rewrite fails too, it is withheld and logged [1].',
        '- **Figures from deterministic detectors**, so the model only describes numbers it was given [3].',
      ].join('\n\n'),
    }),
  },
  {
    id: 'consumer-duty',
    keywords: [
      ['consumer duty', 'fca', 'regulat'],
      ['mean', 'require', 'rule', 'summar', 'what', 'how'],
    ],
    minGroups: 1,
    build: () => ({
      status: 'answered',
      specialist: 'controls',
      routeReason: 'A regulation question about AI features goes to the controls specialist.',
      passages: ['g-consumer-duty', 'a-supervisor-evidence'],
      requiresCitations: true,
      text: [
        'Consumer Duty is the FCA’s requirement that firms act to deliver good outcomes for retail customers. It sets out four outcomes: products and services, price and value, consumer understanding, and consumer support [1].',
        'For AI chart summaries, consumer understanding is the outcome most often discussed. Summaries need to be clear, fair and not misleading for the customers who read them, and firms are expected to test that they are understood [1].',
        'Firms usually also keep evidence they can show a supervisor: the wording rules each summary follows, the checks applied to it, and a record of what each customer saw [2].',
        'This describes the regulation as covered in our guides. It is not legal advice.',
      ].join('\n\n'),
    }),
  },
  {
    id: 'compliance-sign',
    keywords: [
      ['compliance', 'sign', 'signature', 'approve'],
      ['lead', 'need', 'sign off', 'launch'],
    ],
    minGroups: 2,
    build: () => ({
      status: 'answered',
      specialist: 'controls',
      routeReason: 'A sign-off question goes to the controls specialist.',
      passages: ['g-approved-wording', 'g-advice-controls', 'g-model-change'],
      requiresCitations: true,
      text: [
        'Usually five things, agreed before the build and signed before launch [1]:',
        '- **The wording rules**, including what the feature must never say [1].',
        '- **The advice checks**, with test cases showing what they catch [2].',
        '- **The evaluation set and pass criteria**, with results from a parallel run on live data [1].',
        '- **Log retention**: how long answers are kept, who can read them and how one is found by its id [1].',
        '- **The model change process**, including re-running the evaluation before any change goes live [3].',
      ].join('\n\n'),
    }),
  },
  {
    id: 'chart-describe',
    keywords: [
      ['chart', 'range', 'h1', 'candles', 'price action'],
      ['show', 'describe', 'what does', 'explain', 'eurusd'],
    ],
    minGroups: 2,
    build: () => ({
      status: 'answered',
      specialist: 'charts',
      routeReason:
        'A request to describe a chart goes to the charts specialist, which writes up detector output only.',
      passages: ['chart-eurusd'],
      requiresCitations: true,
      text: [
        'Price has held between **1.0848** and **1.0904** for 48 bars [1]. The lower edge has been touched three times, and volume on the latest bar is 2.1 times its 20-bar average [1].',
        'That is a description of what has happened on the chart so far. The figures come from the chart detector, not from the model.',
      ].join('\n\n'),
    }),
  },
  {
    id: 'platform-twin',
    keywords: [
      ['twin', 'assistant'],
      ['client', 'customer', 'platform', 'account questions'],
    ],
    minGroups: 2,
    build: () => ({
      status: 'answered',
      specialist: 'studio',
      routeReason:
        'A question about running a twin for your own clients goes to the studio specialist.',
      passages: ['s-platform-twin', 'g-approved-wording'],
      requiresCitations: true,
      text: [
        'Three things: read-only access to each client’s own account, your rules as structured records, and wording your compliance lead has approved [1].',
        '- **Account data** such as balances, equity, trades and rule status, separated in the data layer so one client’s twin can never read another’s [1].',
        '- **Rules** with their version and effective date, so answers can say which version applied [2].',
        '- **Approved explanations** for the common questions, such as why an account was closed or how close a client is to a limit [2].',
        'Support teams can also have the twin prepare replies for staff to check and send [1].',
      ].join('\n\n'),
    }),
  },
  {
    id: 'studio',
    keywords: [['alchmai', 'studio', 'what do you build', 'services', 'who are you']],
    minGroups: 1,
    build: () => ({
      status: 'answered',
      specialist: 'studio',
      routeReason: 'A question about the studio and its services.',
      passages: ['s-studio', 's-platform-twin'],
      requiresCitations: true,
      text: [
        'AlchmAI builds trading software for brokers, prop firms, independent traders and educators: AI chart analysis, trading charts, trading automation, AI assistants and agents, controls for AI features, and platform, FIX and market data work [1].',
        'Desk Twin is one of those assistants. In a firm’s platform it answers each client from their own account and the firm’s rules, in approved wording [2].',
      ].join('\n\n'),
    }),
  },
];

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

// Known instruments match in any case; anything else must look like a code (six capitals),
// so ordinary words such as "Should" are never mistaken for one.
const KNOWN_INSTRUMENT = /\b(EUR\/?USD|GBP\/?USD|USD\/?JPY|XAU\/?USD|GOLD|OIL|BTC|US500|NAS100)\b/i;
const CODE_INSTRUMENT = /\b([A-Z]{6})\b/;

export function instrumentIn(question: string): string {
  const match =
    question.match(KNOWN_INSTRUMENT)?.[1] ?? question.match(CODE_INSTRUMENT)?.[1] ?? 'EURUSD';
  return match.toUpperCase().replace('/', '');
}

export function adviceRefusal(ctx: ScenarioContext): ScenarioResult {
  const instrument = instrumentIn(ctx.question);
  return {
    status: 'refused',
    specialist: 'controls',
    routeReason:
      'The question asks for a trading decision. The router sends it to the controls specialist to decline.',
    passages: ['r-rules-v3', 'acc-snapshot'],
    requiresCitations: false,
    blockedDrafts: [
      {
        attempt: 1,
        passed: false,
        failedChecks: ['no-forecast'],
        summary:
          'The first draft described a likely direction for the market. It was blocked by the advice checks and never shown.',
      },
    ],
    text: [
      `I can’t tell you whether to buy, sell or hold ${instrument}, and I won’t give a view on where it is going. That decision stays with you.`,
      'Here is what I can do instead:',
      `- **Check the trade against your rules** before you place it. Your session rule is London 07:00 to 16:30 [1], and you have used 1.4% of your 5% daily loss limit today [2].`,
      `- **List today’s releases** for the currencies involved, with times, previous figures and consensus. Type /events.`,
      `- **Set an alert** at a level you choose, for example /alert ${instrument} 1.0900.`,
      `- **Brief you on the headlines** for ${instrument}, with links. Type /brief ${instrument}.`,
    ].join('\n\n'),
  };
}

export function injectionRefusal(): ScenarioResult {
  return {
    status: 'refused',
    specialist: 'controls',
    routeReason:
      'The message tries to change the twin’s rules. It is logged as a likely prompt injection attempt.',
    passages: [],
    requiresCitations: false,
    text: [
      'I can’t change how I work from inside a conversation, and I don’t give price targets or trade calls.',
      'My rules and checks are set by your firm and run outside the conversation, so instructions in a message or a document don’t change them. This attempt has been logged.',
      'I can describe what a chart has done so far, show the levels you have alerts on, or check a trade against your own rules.',
    ].join('\n\n'),
  };
}

export function notCovered(ctx: ScenarioContext): ScenarioResult {
  return {
    status: 'not-covered',
    specialist: 'studio',
    routeReason: 'No specialist library has passages that answer this question.',
    passages: [],
    requiresCitations: false,
    text: [
      'That isn’t covered by the material I answer from, so I won’t guess.',
      `I answer from your rules, trades, notes and connected sources, and from ${ctx.tenant.name}’s guides. You could try:`,
      '- How close am I to my daily limit?',
      '- How do you prove a drawdown breach?',
      '- /prep for today’s session checklist',
    ].join('\n\n'),
  };
}

// ---------------------------------------------------------------------------
// Shortcuts
// ---------------------------------------------------------------------------

function eventsTable(ctx: ScenarioContext): AnswerBlock {
  return {
    type: 'table',
    title: 'Today’s releases',
    columns: ['Time', 'Currency', 'Release', 'Previous', 'Consensus'],
    monoColumns: [0, 3, 4],
    rows: ctx.events().map((e) => [e.time, e.currency, e.title, e.previous, e.consensus]),
  };
}

const YESTERDAY_TRADES: AnswerBlock = {
  type: 'table',
  title: 'Yesterday’s trades',
  columns: ['Time', 'Instrument', 'Side', 'Result', 'Against your rules'],
  monoColumns: [0, 3],
  rows: [
    ['08:14', 'EURUSD', 'Long', '+0.4R', 'Within rules'],
    ['10:02', 'GBPUSD', 'Short', '−1.0R', 'Inside a release window (Rule 4)'],
    ['13:41', 'XAUUSD', 'Long', '+1.2R', 'Within rules'],
    ['16:42', 'EURUSD', 'Short', '−0.3R', 'Outside the session (Rule 2)'],
  ],
};

type ShortcutBuilder = (ctx: ScenarioContext) => ScenarioResult;

export const SHORTCUT_SCENARIOS: Record<string, ShortcutBuilder> = {
  '/prep': (ctx) => ({
    status: 'answered',
    specialist: 'strategy',
    routeReason: 'The /prep shortcut runs your saved session prep task.',
    passages: ['r-rules-v3', 't-yesterday', 'cal-today'],
    requiresCitations: true,
    text: `Your session prep for ${formatLongDate(ctx.now, loc(ctx))}: your rules (version 3) [1], yesterday’s trades [2] and today’s releases [3], as one checklist.`,
    blocks: [
      {
        type: 'checklist',
        title: 'Before the open',
        items: [
          {
            label: 'Session rule: London 07:00 to 16:30',
            meta: 'Rule 2. Yesterday one trade at 16:42 was outside it',
            state: 'attention',
          },
          {
            label: 'No more than 3 trades per session',
            meta: 'Rule 3. Yesterday: 4 trades',
            state: 'attention',
          },
          {
            label: 'No new trades 10 minutes either side of high-impact releases',
            meta: 'Rule 4. Today: 07:00, 10:00, 13:30',
            state: 'todo',
          },
          { label: 'Daily loss limit 5%', meta: 'Rule 1. Used yesterday: 1.4%', state: 'ok' },
          { label: 'Journal yesterday’s trades', meta: '2 of 4 written up', state: 'todo' },
        ],
      },
      YESTERDAY_TRADES,
      eventsTable(ctx),
    ],
  }),

  '/events': (ctx) => ({
    status: 'answered',
    specialist: 'platforms',
    routeReason: 'The /events shortcut runs your morning events workflow.',
    passages: ['cal-today', 't-watchlist'],
    requiresCitations: true,
    text: `${ctx.events().length} releases today match currencies on your watchlist [1][2]. They are in your calendar with a 10-minute reminder each, and on today’s list.`,
    blocks: [
      eventsTable(ctx),
      {
        type: 'metrics',
        items: [
          {
            label: 'Calendar events',
            value: String(ctx.events().length),
            hint: 'added to your calendar',
            tone: 'success',
          },
          { label: 'Reminders', value: '10 min', hint: 'before each release', tone: 'neutral' },
          { label: 'Wrote to', value: '2', hint: 'destinations you allowed', tone: 'neutral' },
        ],
      },
    ],
  }),

  '/recap': (ctx) => {
    const approval = ctx.upsertApproval({
      id: 'apr_recap_today',
      kind: 'email',
      title: 'Session recap to your coach',
      summary: 'Today’s trades tagged against your rules, with a one-page summary attached.',
      recipients: [{ name: 'Jordan Ellis', address: 'jordan.ellis@coach.example' }],
      subject: `Session recap, ${formatLongDate(ctx.now, loc(ctx))}`,
      body: [
        'Hi Jordan,',
        '',
        'Today’s session, tagged against my written rules (version 3):',
        '',
        '- 4 trades, 3 within my rules',
        '- 1 trade inside a release window (Rule 4)',
        '- Daily loss used: 1.4% of 5%',
        '',
        'The one-page review is attached. Happy to go through the 10:02 GBPUSD trade on Friday.',
        '',
        `${ctx.user.name.split(' ')[0]}`,
      ].join('\n'),
      attachments: [{ name: 'session-recap.pdf', size: '1 page' }],
      origin: 'Session recap (/recap)',
    });
    return {
      status: 'answered',
      specialist: 'strategy',
      routeReason: 'The /recap shortcut runs your session recap task.',
      passages: ['t-yesterday', 'r-rules-v3'],
      requiresCitations: true,
      text: 'Today’s trades, tagged against your rules (version 3) [1][2]. Three of four were within your rules. The summary is in your journal, and the email to your coach is waiting for your approval.',
      blocks: [
        {
          type: 'metrics',
          items: [
            { label: 'Trades', value: '4', tone: 'neutral' },
            { label: 'Within rules', value: '3 of 4', tone: 'warning' },
            { label: 'Net result', value: '+0.3R', tone: 'neutral' },
            { label: 'Daily loss used', value: '1.4%', hint: 'of 5%', tone: 'success' },
          ],
        },
        YESTERDAY_TRADES,
        {
          type: 'approval',
          approvalId: approval.id,
          title: approval.title,
          recipients: approval.recipients.map((r) => r.name),
        },
      ],
    };
  },

  '/brief': (ctx) => {
    const instrument = (ctx.args.split(/\s+/)[0] || 'EURUSD').toUpperCase().slice(0, 12);
    return {
      status: 'answered',
      specialist: 'ai-analysis',
      routeReason: `The /brief shortcut summarises headlines on ${instrument} from your licensed news feed.`,
      passages: ['n-eurusd-1', 'n-eurusd-2', 'n-eurusd-3', 'n-eurusd-4'],
      requiresCitations: true,
      text: [
        `Four headlines relevant to ${instrument} from your news feed in the last 12 hours [1][2][3][4]:`,
        '- Euro area flash inflation for October is due at 10:00 UK time. The previous reading was 2.1% [1].',
        '- Two ECB Governing Council members speak at separate events from 14:00 [2].',
        '- US core PCE for September is due at 13:30, with consensus at 0.3% month on month [3].',
        '- The euro area bank lending survey reported tighter credit standards for firms [4].',
      ].join('\n\n'),
      blocks: [
        {
          type: 'links',
          title: 'Sources',
          items: [
            {
              label: 'Euro area flash inflation due at 10:00',
              meta: 'Sample Newswire',
              citation: 1,
            },
            {
              label: 'ECB speakers scheduled this afternoon',
              meta: 'Sample Newswire',
              citation: 2,
            },
            { label: 'US core PCE at 13:30', meta: 'Sample Newswire', citation: 3 },
            {
              label: 'Euro area bank lending survey published',
              meta: 'Sample Newswire',
              citation: 4,
            },
          ],
        },
      ],
    };
  },

  '/alert': (ctx) => {
    const [rawInstrument, rawLevel] = ctx.args.split(/\s+/);
    const instrument = rawInstrument?.toUpperCase();
    const level = Number(rawLevel);
    if (
      !instrument ||
      !/^[A-Z0-9.]{3,12}$/.test(instrument) ||
      !Number.isFinite(level) ||
      level <= 0
    ) {
      return {
        status: 'answered',
        specialist: 'platforms',
        routeReason: 'The /alert shortcut needs an instrument and a level.',
        passages: [],
        requiresCitations: false,
        text: 'Add an instrument and a level after the command, for example **/alert EURUSD 1.0900**.',
      };
    }
    const alert = ctx.createPriceAlert(instrument, level);
    return {
      status: 'answered',
      specialist: 'platforms',
      routeReason: 'The /alert shortcut sets a price alert at the level you typed.',
      passages: [],
      requiresCitations: false,
      text: `Alert set. You’ll be notified in the app and by push when ${alert.instrument} trades at ${rawLevel}. You can change or remove it in Alerts.`,
      blocks: [
        {
          type: 'metrics',
          items: [
            { label: 'Instrument', value: instrument, tone: 'neutral' },
            { label: 'Level', value: rawLevel ?? '', tone: 'brand' },
            { label: 'Channels', value: 'In-app, push', tone: 'neutral' },
          ],
        },
      ],
    };
  },

  '/payout': (ctx) => {
    const account = ctx.args.match(/\d{3,8}/)?.[0] ?? '10482';
    const approval = ctx.upsertApproval({
      id: `apr_payout_${account}`,
      kind: 'payout-check',
      title: `Payout check for account ${account}`,
      summary: 'All six payout rules pass. Ready for a person on the risk team to approve.',
      recipients: [{ name: 'Risk team', address: 'risk@northbridge.example' }],
      body: [
        `Account ${account} checked against payout rules version 5.`,
        '',
        '1. Minimum 5 trading days: 11 days. Pass.',
        '2. Profit target met: yes. Pass.',
        '3. No breach in the period: none recorded. Pass.',
        '4. Consistency rule under 40%: best day 28%. Pass.',
        '5. KYC current: verified. Pass.',
        '6. Request inside the payout window: day 2. Pass.',
      ].join('\n'),
      attachments: [{ name: `payout-${account}-evidence.csv`, size: '42 KB' }],
      origin: 'Payout check (/payout)',
    });
    return {
      status: 'answered',
      specialist: 'prop-rules',
      routeReason:
        'The /payout shortcut checks an account against the payout rules for a person to approve.',
      passages: ['r-payout-v5', 'acc-10482'],
      requiresCitations: true,
      text: `Account ${account} checked against the payout rules, version 5 [1][2]. All six rules pass. The check is ready for a person on the risk team to approve; nothing is paid until they do.`,
      blocks: [
        {
          type: 'checklist',
          title: 'Payout rules, version 5',
          items: [
            { label: 'Minimum 5 trading days', meta: '11 days', state: 'ok' },
            { label: 'Profit target met', meta: 'Yes', state: 'ok' },
            { label: 'No breach in the period', meta: 'None recorded', state: 'ok' },
            { label: 'Consistency rule under 40%', meta: 'Best day 28%', state: 'ok' },
            { label: 'KYC current', meta: 'Verified', state: 'ok' },
            { label: 'Request inside the payout window', meta: 'Day 2 of 7', state: 'ok' },
          ],
        },
        {
          type: 'approval',
          approvalId: approval.id,
          title: approval.title,
          recipients: approval.recipients.map((r) => r.name),
        },
      ],
    };
  },

  '/handover': (ctx) => {
    const open = ctx.openActionItems();
    const pending = ctx.pendingApprovals();
    return {
      status: 'answered',
      specialist: 'studio',
      routeReason: 'The /handover shortcut gathers open items, approvals and tomorrow’s reminders.',
      passages: [],
      requiresCitations: false,
      text: `End-of-day handover for ${formatLongDate(ctx.now, loc(ctx))}: ${open.length} open items, ${pending.length} approvals waiting and tomorrow’s reminders, in one note.`,
      blocks: [
        {
          type: 'checklist',
          title: 'Open items',
          items: open.map((i) => ({ label: i.title, meta: i.due, state: 'todo' as const })),
        },
        {
          type: 'checklist',
          title: 'Approvals waiting',
          items: pending.map((a) => ({
            label: a.title,
            meta: a.recipients.map((r) => r.name).join(', '),
            state: 'attention' as const,
          })),
        },
        {
          type: 'checklist',
          title: 'Tomorrow',
          items: [
            { label: 'Session prep', meta: '07:30', state: 'todo' },
            { label: 'Read the morning review', meta: '07:50', state: 'todo' },
            { label: 'US non-farm payrolls', meta: '13:30, high impact', state: 'todo' },
          ],
        },
      ],
    };
  },

  '/note': (ctx) => {
    const text = ctx.args.trim();
    if (!text) {
      return {
        status: 'answered',
        specialist: 'studio',
        routeReason: 'The /note shortcut saves a thought to your journal.',
        passages: [],
        requiresCitations: false,
        text: 'Add the note after the command, for example **/note Waited for the 10:00 release before entering.**',
      };
    }
    ctx.saveNote(text);
    const tags = [
      ...new Set(text.toUpperCase().match(/\b(?:EURUSD|GBPUSD|USDJPY|XAUUSD|US500)\b/g) ?? []),
    ];
    return {
      status: 'answered',
      specialist: 'studio',
      routeReason: 'The /note shortcut saves a thought to your journal.',
      passages: [],
      requiresCitations: false,
      text: `Saved to your journal at ${formatTime(ctx.now, loc(ctx))}${tags.length ? `, tagged ${tags.join(', ')}` : ''}.`,
    };
  },

  '/review': () => ({
    status: 'answered',
    specialist: 'strategy',
    routeReason: 'The /review shortcut runs your weekly review task.',
    passages: ['t-week', 'r-rules-v3'],
    requiresCitations: true,
    text: 'This week’s trades checked against your written rules, version 3 [1][2]. Fourteen of seventeen were within your rules. The patterns below are described with the trades behind them.',
    blocks: [
      {
        type: 'metrics',
        items: [
          { label: 'Trades', value: '17', tone: 'neutral' },
          { label: 'Within rules', value: '14 of 17', tone: 'warning' },
          {
            label: 'Most common exception',
            value: 'Rule 2',
            hint: 'outside the session',
            tone: 'warning',
          },
          { label: 'Daily limit reached', value: '0 days', tone: 'success' },
        ],
      },
      {
        type: 'checklist',
        title: 'Patterns this week',
        items: [
          {
            label: 'Two of three exceptions came after 16:00',
            meta: 'Tue 16:42 EURUSD, Thu 16:51 GBPUSD',
            state: 'attention',
          },
          {
            label: 'Trades inside release windows: 1',
            meta: 'Wed 10:02 GBPUSD',
            state: 'attention',
          },
          {
            label: 'Every session stayed under 3% daily loss',
            meta: 'Highest: Wednesday, 2.2%',
            state: 'ok',
          },
        ],
      },
    ],
  }),
};

export function matchQuestion(question: string): QuestionScenario | undefined {
  const q = ` ${question.toLowerCase()} `;
  let best: { scenario: QuestionScenario; score: number } | undefined;
  for (const scenario of QUESTION_SCENARIOS) {
    const [primary = []] = scenario.keywords;
    if (!primary.some((k) => q.includes(k))) continue;
    const score = scenario.keywords.filter((group) => group.some((k) => q.includes(k))).length;
    if (score >= scenario.minGroups && (!best || score > best.score)) best = { scenario, score };
  }
  return best?.scenario;
}
