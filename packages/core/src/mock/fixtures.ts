import type { User } from '../domain/auth';
import type { DeskType } from '../domain/desk';
import type { Automation, AutomationRun, AutomationStep } from '../domain/automation';
import type {
  Alert,
  Approval,
  AuditEvent,
  ConnectedSource,
  Notification,
  Shortcut,
} from '../domain/operations';
import type {
  ActionItem,
  EconomicEvent,
  NewsItem,
  RoutineItem,
  RuleWatch,
} from '../domain/overview';
import { ADVICE_CHECKS } from '../compliance/advice-checks';
import { atLocalTime, minutesAgo, minutesSinceMidnight, seededRandom, weekdayIn } from './util';

/** Synthetic demo data. Nothing here describes a real account, person or market. */

const passedChecks = () => ADVICE_CHECKS.map(({ id, label }) => ({ id, label, passed: true }));

// ---------------------------------------------------------------------------
// Routine: "a day on this desk, handled"
// ---------------------------------------------------------------------------

type RoutineSeed = [slot: string, title: string, description: string, shortcut?: string];

const ROUTINES: Record<DeskType, RoutineSeed[]> = {
  'independent-trader': [
    [
      '07:00',
      'Today’s action items',
      'Follow-ups, reminders and anything waiting for you, in one list.',
    ],
    [
      '07:30',
      'Session prep',
      'Your rules, yesterday’s trades and today’s events, as one checklist.',
      '/prep',
    ],
    [
      '07:45',
      'Economic events',
      'Today’s releases with times, previous figures and consensus, added to your calendar.',
      '/events',
    ],
    [
      '08:00',
      'News brief',
      'Headlines on the instruments you follow, summarised with links.',
      '/brief EURUSD',
    ],
    [
      'Live',
      'Alerts and rule watch',
      'Prices at the levels you set, and how much of your daily loss limit is used.',
    ],
    [
      '17:00',
      'Session recap',
      'The day’s trades tagged against your rules, with a summary in your journal.',
      '/recap',
    ],
    [
      'Fri',
      'Weekly review',
      'The week’s trades checked against your written rules, with the patterns behind them.',
      '/review',
    ],
  ],
  'prop-firm': [
    [
      '06:30',
      'Overnight breach report',
      'Accounts that crossed a rule overnight, each with its breach record.',
    ],
    [
      '07:30',
      'Rule changes digest',
      'Rule versions effective today, and which accounts they affect.',
    ],
    [
      '09:00',
      'Payout checks',
      'Requests checked against the payout rules, for a person to approve.',
      '/payout 10482',
    ],
    ['Live', 'Rule watch across accounts', 'Accounts near their daily loss and drawdown limits.'],
    [
      '12:00',
      'Support replies drafted',
      'Trader questions answered from their account and your rules, for staff to send.',
    ],
    [
      '17:30',
      'End-of-day handover',
      'Open items, approvals waiting and tomorrow’s reminders, in one note.',
      '/handover',
    ],
    ['Fri', 'Disputes review', 'Open disputes with the breach evidence behind each one.'],
  ],
  broker: [
    [
      '07:00',
      'Platform status brief',
      'Feeds, servers and bridges, with anything that happened overnight.',
    ],
    [
      '07:45',
      'Economic events',
      'Releases that affect margin and spreads, in your team’s calendar.',
      '/events',
    ],
    [
      '09:00',
      'Commentary checks',
      'Published chart commentary checked against your wording rules.',
    ],
    ['Live', 'Client questions', 'Answered from each client’s account, in approved wording.'],
    ['13:00', 'Support replies drafted', 'Replies prepared for your team to check and send.'],
    [
      '17:00',
      'End-of-day handover',
      'Open items, approvals waiting and tomorrow’s reminders.',
      '/handover',
    ],
    [
      'Fri',
      'Outcomes evidence',
      'What clients asked and what they were told, for your Consumer Duty file.',
    ],
  ],
  'trading-education': [
    ['07:30', 'Lesson prep', 'Today’s lessons with the charts and examples they use.'],
    ['09:00', 'Student questions', 'Answered from your course material, without trade calls.'],
    ['12:00', 'Chart examples checked', 'Lesson charts checked so they teach without tipping.'],
    ['Live', 'Release reminders', 'Scheduled releases your students should know about.'],
    ['16:00', 'Feedback drafts', 'Homework feedback for you to approve and send.'],
    ['18:00', 'Session notes', 'Thoughts from today’s class, saved to your notes.', '/note'],
    ['Fri', 'Cohort review', 'Where the cohort is stuck, with the questions behind it.'],
  ],
  'fintech-engineering': [
    ['08:00', 'Overnight incidents', 'Alerts, failed jobs and anything waiting for a person.'],
    [
      '09:00',
      'Provider changes',
      'Changes in platform and data provider APIs, summarised with links.',
    ],
    ['10:00', 'Integration checks', 'Connections tested read-only, with results logged.'],
    ['Live', 'Feed health', 'Latency and gaps in your market data feeds.'],
    ['15:00', 'Tickets drafted', 'Bug reports and follow-ups for you to approve.'],
    ['17:30', 'Handover', 'Open items and tomorrow’s reminders, in one note.', '/handover'],
    ['Fri', 'Dependency review', 'Library and provider versions due for an update.'],
  ],
  'research-quant': [
    ['07:00', 'Data quality check', 'Overnight gaps, outliers and late files in your datasets.'],
    ['08:00', 'Research digest', 'Papers and notes you follow, summarised with links.'],
    [
      '09:30',
      'Economic events',
      'Today’s releases matched to the markets you research.',
      '/events',
    ],
    ['Live', 'Run monitor', 'Backtests and jobs, with anything that failed.'],
    ['14:00', 'Findings', 'Notes and findings saved where you can find them.', '/note'],
    ['17:00', 'Experiment log', 'Today’s runs written up with their parameters.'],
    ['Fri', 'Weekly research review', 'What was tested, what changed and what is next.'],
  ],
};

export function buildRoutine(deskType: DeskType, timezone: string, now: Date): RoutineItem[] {
  const minutes = minutesSinceMidnight(timezone, now);
  const isFriday = weekdayIn(timezone, now) === 5;
  let nextAssigned = false;
  return ROUTINES[deskType].map(([slot, title, description, shortcut], i) => {
    let state: RoutineItem['state'];
    if (slot === 'Live') state = 'live';
    else if (slot === 'Fri') state = isFriday && !nextAssigned ? 'next' : 'later';
    else {
      const [h = 0, m = 0] = slot.split(':').map(Number);
      const at = h * 60 + m;
      if (minutes >= at && minutes < at + 10) state = 'running';
      else if (minutes >= at) state = 'done';
      else if (!nextAssigned) {
        state = 'next';
        nextAssigned = true;
      } else state = 'later';
    }
    return { id: `rt_${deskType}_${i}`, slot, title, description, shortcut, state };
  });
}

// ---------------------------------------------------------------------------
// Rule watch
// ---------------------------------------------------------------------------

export function buildRuleWatch(deskType: DeskType, timezone: string, now: Date): RuleWatch {
  const rand = seededRandom(4471);
  const start = 102_650;
  const end = 101_212;
  const points = 64;
  const series: number[] = [];
  for (let i = 0; i < points; i += 1) {
    const t = i / (points - 1);
    const drift = start + (end - start) * t;
    const swing = Math.sin(t * Math.PI * 2.4) * 420 * (1 - t * 0.6);
    const noise = (rand() - 0.5) * 260;
    series.push(Math.round(i === points - 1 ? end : drift + swing + noise));
  }
  const minutes = minutesSinceMidnight(timezone, now);
  const inside = minutes >= 7 * 60 && minutes < 16 * 60 + 30;
  const opensInMinutes = minutes < 7 * 60 ? 7 * 60 - minutes : 24 * 60 - minutes + 7 * 60;
  const labels: Partial<Record<DeskType, string>> = {
    'prop-firm': 'Funded account 10482',
    broker: 'Client account 88213 (sample)',
  };
  return {
    accountId: '4471',
    accountLabel: labels[deskType] ?? 'MT5 · Live 4471',
    currency: 'GBP',
    balance: 100_000,
    equity: end,
    equityFloor: 90_000,
    dailyLossLimitPct: 5,
    dailyLossUsedPct: 1.4,
    maxDrawdownPct: 10,
    drawdownUsedPct: 2.1,
    resetsAt: '22:00 UK time',
    ruleVersion: 3,
    session: {
      label: 'London 07:00 to 16:30',
      inside,
      opensIn: inside ? undefined : `${Math.floor(opensInMinutes / 60)}h ${opensInMinutes % 60}m`,
    },
    equitySeries: series,
    tradesToday: 2,
    maxTradesPerSession: 3,
  };
}

export const ECONOMIC_EVENTS: EconomicEvent[] = [
  {
    id: 'ev_1',
    time: '07:00',
    currency: 'GBP',
    title: 'GDP m/m',
    impact: 'high',
    previous: '0.2%',
    consensus: '0.1%',
    inCalendar: true,
  },
  {
    id: 'ev_2',
    time: '09:30',
    currency: 'GBP',
    title: 'Services PMI',
    impact: 'medium',
    previous: '52.4',
    consensus: '52.1',
    inCalendar: true,
  },
  {
    id: 'ev_3',
    time: '10:00',
    currency: 'EUR',
    title: 'CPI flash estimate y/y',
    impact: 'high',
    previous: '2.1%',
    consensus: '2.0%',
    inCalendar: true,
  },
  {
    id: 'ev_4',
    time: '13:30',
    currency: 'USD',
    title: 'Core PCE price index m/m',
    impact: 'high',
    previous: '0.2%',
    consensus: '0.3%',
    inCalendar: true,
  },
  {
    id: 'ev_5',
    time: '15:00',
    currency: 'USD',
    title: 'Consumer sentiment (prelim)',
    impact: 'medium',
    previous: '55.0',
    consensus: '54.6',
    inCalendar: true,
  },
];

export function seedActionItems(): ActionItem[] {
  return [
    { id: 'ai_1', title: 'Read the morning review', kind: 'reminder', due: '07:50', done: true },
    {
      id: 'ai_2',
      title: 'Approve the session recap email to Jordan',
      kind: 'approval',
      due: 'Today',
      done: false,
    },
    {
      id: 'ai_3',
      title: 'Reply to Jordan about Tuesday’s GBPUSD trade',
      kind: 'follow-up',
      due: 'Today',
      done: false,
    },
    {
      id: 'ai_4',
      title: 'Upload the October broker statement',
      kind: 'follow-up',
      due: 'Fri',
      done: false,
    },
    {
      id: 'ai_5',
      title: 'Weekly review: trades after 16:00',
      kind: 'review',
      due: 'Fri',
      done: false,
    },
  ];
}

export function seedNews(now: number): NewsItem[] {
  return [
    {
      id: 'nw_1',
      headline: 'Euro area flash inflation due at 10:00',
      source: 'Sample Newswire',
      at: minutesAgo(48, now),
      instruments: ['EURUSD'],
    },
    {
      id: 'nw_2',
      headline: 'US core PCE at 13:30; consensus 0.3% m/m',
      source: 'Sample Newswire',
      at: minutesAgo(95, now),
      instruments: ['EURUSD', 'US500'],
    },
    {
      id: 'nw_3',
      headline: 'ECB speakers scheduled from 14:00',
      source: 'Sample Newswire',
      at: minutesAgo(160, now),
      instruments: ['EURUSD'],
    },
    {
      id: 'nw_4',
      headline: 'UK services PMI due at 09:30',
      source: 'Sample Newswire',
      at: minutesAgo(230, now),
      instruments: ['GBPUSD'],
    },
  ];
}

// ---------------------------------------------------------------------------
// Tasks and workflows
// ---------------------------------------------------------------------------

function steps(
  prefix: string,
  list: Array<[AutomationStep['verb'], string, string, boolean?]>,
): AutomationStep[] {
  return list.map(([verb, system, description, needsApproval = false], i) => ({
    id: `${prefix}_s${i + 1}`,
    verb,
    system,
    description,
    needsApproval,
  }));
}

function runsFor(
  a: Automation,
  now: Date,
  timezone: string,
  count: number,
  failLatest = false,
): AutomationRun[] {
  const runs: AutomationRun[] = [];
  const time = a.schedule.label.match(/\d{2}:\d{2}/)?.[0] ?? '09:00';
  for (let d = 0; d < count; d += 1) {
    const startedAt = atLocalTime(timezone, time, -d, now);
    if (startedAt.getTime() > now.getTime()) continue;
    const failed = failLatest && runs.length === 0;
    const needsApproval = a.steps.some((s) => s.needsApproval);
    runs.push({
      id: `${a.id}_run${d}`,
      automationId: a.id,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date(startedAt.getTime() + 41_000 + d * 1_700).toISOString(),
      status: failed ? 'stopped' : needsApproval && d === 0 ? 'awaiting-approval' : 'succeeded',
      trigger: d === 1 && a.shortcut ? 'shortcut' : 'schedule',
      steps: a.steps.map((s, i) => {
        const stepFailed = failed && i === 0;
        const skipped = failed && i > 0;
        return {
          stepId: s.id,
          status: stepFailed
            ? 'failed'
            : skipped
              ? 'skipped'
              : s.needsApproval && d === 0
                ? 'waiting'
                : 'succeeded',
          message: stepFailed
            ? 'The page layout changed, so the figures could not be read reliably. Stopped instead of guessing.'
            : skipped
              ? 'Skipped because an earlier step stopped.'
              : s.needsApproval && d === 0
                ? 'Waiting for your approval.'
                : `${s.verb === 'read' ? 'Read' : 'Completed'} · ${s.system}`,
          at: new Date(startedAt.getTime() + (i + 1) * 6_000).toISOString(),
        };
      }),
    });
  }
  return runs;
}

export function seedAutomations(
  user: User,
  now: Date,
): { automations: Automation[]; runs: Record<string, AutomationRun[]> } {
  const tz = user.timezone;
  const created = minutesAgo(60 * 24 * 21, now.getTime());
  const tomorrow = (hhmm: string) => atLocalTime(tz, hhmm, 1, now).toISOString();

  const automations: Automation[] = [
    {
      id: 'aut_review',
      kind: 'task',
      name: 'Morning review',
      instruction:
        'Every weekday before London opens, check yesterday against my rules, write it up, email it to my coach and remind me to read it.',
      shortcut: '/review',
      schedule: { kind: 'schedule', label: 'Weekdays, 07:30', cron: '30 7 * * 1-5' },
      sources: ['MetaTrader 5', 'Your rules'],
      destinations: ['Email', 'Google Calendar'],
      steps: steps('aut_review', [
        ['read', 'MetaTrader 5', 'Read yesterday’s trades from your platform export, read-only'],
        ['check', 'Your rules', 'Check each one against your written rules, version 3'],
        ['write', 'Journal', 'Write a one-page review, with the trades behind each point'],
        ['draft', 'Email', 'Draft the email to your coach, with the review attached', true],
        ['remind', 'Google Calendar', 'Add a 07:50 reminder to your calendar: read the review'],
      ]),
      recipients: ['Jordan Ellis (coach)'],
      status: 'active',
      createdAt: created,
      nextRunAt: tomorrow('07:30'),
    },
    {
      id: 'aut_prep',
      kind: 'task',
      name: 'Session prep',
      instruction:
        'Before each session, put my rules, yesterday’s trades and today’s events into one checklist.',
      shortcut: '/prep',
      schedule: { kind: 'schedule', label: 'Weekdays, 07:30', cron: '30 7 * * 1-5' },
      sources: ['Your rules', 'MetaTrader 5', 'Economic calendar'],
      destinations: ['Action items'],
      steps: steps('aut_prep', [
        ['read', 'Your rules', 'Read your written rules, version 3'],
        ['read', 'MetaTrader 5', 'Read yesterday’s trades, read-only'],
        ['read', 'Economic calendar', 'Read today’s releases for your watchlist currencies'],
        ['write', 'Action items', 'Write one checklist for the session'],
      ]),
      recipients: [],
      status: 'active',
      createdAt: created,
      nextRunAt: tomorrow('07:30'),
    },
    {
      id: 'aut_recap',
      kind: 'task',
      name: 'Session recap',
      instruction:
        'After the session, tag today’s trades against my rules, summarise them in my journal and draft an email to my coach.',
      shortcut: '/recap',
      schedule: { kind: 'schedule', label: 'Weekdays, 17:00', cron: '0 17 * * 1-5' },
      sources: ['MetaTrader 5', 'Your rules'],
      destinations: ['Journal', 'Email'],
      steps: steps('aut_recap', [
        ['read', 'MetaTrader 5', 'Read today’s closed trades, read-only'],
        ['check', 'Your rules', 'Tag each trade against your rules, version 3'],
        ['write', 'Journal', 'Write the session summary to your journal'],
        ['draft', 'Email', 'Draft the recap email to your coach', true],
      ]),
      recipients: ['Jordan Ellis (coach)'],
      status: 'active',
      createdAt: created,
      nextRunAt: atLocalTime(
        tz,
        '17:00',
        minutesSinceMidnight(tz, now) >= 17 * 60 ? 1 : 0,
        now,
      ).toISOString(),
    },
    {
      id: 'aut_weekly',
      kind: 'task',
      name: 'Weekly review',
      instruction:
        'Fridays at 5pm, review my week against my rules and describe the patterns behind any exceptions.',
      schedule: { kind: 'schedule', label: 'Fridays, 17:00', cron: '0 17 * * 5' },
      sources: ['MetaTrader 5', 'Your rules'],
      destinations: ['Journal'],
      steps: steps('aut_weekly', [
        ['read', 'MetaTrader 5', 'Read the week’s trades, read-only'],
        ['check', 'Your rules', 'Check each against your rules, version 3'],
        ['compare', 'Desk Twin', 'Compare with the previous four weeks'],
        ['write', 'Journal', 'Write the weekly review, with the trades behind each pattern'],
      ]),
      recipients: [],
      status: 'active',
      createdAt: created,
    },
    {
      id: 'aut_events',
      kind: 'workflow',
      name: 'Morning events',
      instruction:
        'Every morning, read the economic calendar, match today’s releases to my watchlist, put them in my calendar and today’s list.',
      shortcut: '/events',
      schedule: { kind: 'schedule', label: 'Weekdays, 07:00', cron: '0 7 * * 1-5' },
      sources: ['Economic calendar', 'MetaTrader 5'],
      destinations: ['Google Calendar', 'Action items'],
      steps: steps('aut_events', [
        [
          'read',
          'Economic calendar',
          'Today’s releases with times, previous figures and consensus',
        ],
        ['read', 'MetaTrader 5', 'The instruments on your watchlist'],
        ['match', 'Desk Twin', 'Releases in those instruments’ currencies'],
        ['write', 'Google Calendar', 'One event per release, with a 10-minute reminder'],
        ['write', 'Action items', 'Today’s list, with each release time'],
      ]),
      recipients: [],
      status: 'active',
      createdAt: created,
      nextRunAt: tomorrow('07:00'),
    },
    {
      id: 'aut_swaps',
      kind: 'workflow',
      name: 'Swap rates to costs sheet',
      instruction:
        'When my broker updates its swap rates page, read it, compare with last week, and update my costs sheet.',
      schedule: { kind: 'event', label: 'When the page changes, checked 06:00' },
      sources: ['Broker website'],
      destinations: ['Google Sheets'],
      steps: steps('aut_swaps', [
        ['read', 'Broker website', 'Swap rates page, where the site’s terms permit'],
        ['compare', 'Desk Twin', 'Compare each rate with last week’s'],
        ['write', 'Google Sheets', 'Update the costs sheet, one row per instrument'],
      ]),
      recipients: [],
      status: 'active',
      createdAt: created,
    },
    {
      id: 'aut_journal',
      kind: 'workflow',
      name: 'Post-session journal',
      instruction:
        'After each session, pull my trades from cTrader, tag them against my rules, and add a summary to my journal.',
      schedule: { kind: 'event', label: 'After each session, 16:45' },
      sources: ['cTrader', 'Your rules'],
      destinations: ['Journal'],
      steps: steps('aut_journal', [
        ['read', 'cTrader', 'Today’s closed trades, read-only'],
        ['check', 'Your rules', 'Tag each against your rules, version 3'],
        ['write', 'Journal', 'Add the summary to your journal'],
      ]),
      recipients: [],
      status: 'paused',
      createdAt: created,
    },
  ];

  const runs: Record<string, AutomationRun[]> = {};
  for (const a of automations) {
    runs[a.id] = runsFor(a, now, tz, 5, a.id === 'aut_swaps');
    a.lastRun = runs[a.id]?.[0];
  }
  return { automations, runs };
}

// ---------------------------------------------------------------------------
// Shortcuts, alerts, notifications
// ---------------------------------------------------------------------------

export function seedShortcuts(now: number): Shortcut[] {
  const s = (
    command: string,
    title: string,
    description: string,
    usageCount: number,
    extra: Partial<Shortcut> = {},
  ): Shortcut => ({
    id: `sc_${command.slice(1)}`,
    command,
    title,
    description,
    usageCount,
    lastUsedAt: usageCount ? minutesAgo(usageCount * 37, now) : undefined,
    builtIn: true,
    ...extra,
  });
  return [
    s(
      '/prep',
      'Morning session prep',
      'Your rules, yesterday’s trades and today’s events, as one checklist.',
      48,
      { automationId: 'aut_prep' },
    ),
    s(
      '/events',
      'Morning events workflow',
      'Today’s releases matched to your watchlist, into your calendar and list.',
      31,
      { automationId: 'aut_events' },
    ),
    s(
      '/recap',
      'Session recap',
      'Today’s trades tagged against your rules, with a summary in your journal.',
      29,
      { automationId: 'aut_recap' },
    ),
    s('/brief', 'News brief', 'Headlines on the instrument you name, summarised with links.', 22, {
      argsHint: 'EURUSD',
    }),
    s('/alert', 'Price alert', 'A notification when it trades at the level you typed.', 17, {
      argsHint: 'EURUSD 1.0900',
    }),
    s(
      '/payout',
      'Payout check',
      'That account checked against the rules, for a person to approve.',
      6,
      { argsHint: '10482' },
    ),
    s(
      '/handover',
      'End-of-day handover',
      'Open items, approvals waiting and tomorrow’s reminders, in one note.',
      12,
    ),
    s(
      '/note',
      'Journal note',
      'Save a thought to your journal, tagged with the instruments it mentions.',
      40,
      { argsHint: 'your note' },
    ),
    s(
      '/review',
      'Morning review',
      'Yesterday checked against your rules and written up for your coach.',
      9,
      { automationId: 'aut_review', builtIn: false },
    ),
  ];
}

export function seedAlerts(now: number): Alert[] {
  return [
    {
      id: 'al_eurusd',
      kind: 'price',
      name: 'EURUSD at 1.0900',
      condition: 'EURUSD trades at 1.0900',
      instrument: 'EURUSD',
      level: 1.09,
      channels: ['in-app', 'push'],
      status: 'active',
      createdAt: minutesAgo(60 * 26, now),
    },
    {
      id: 'al_gbpusd',
      kind: 'price',
      name: 'GBPUSD at 1.2700',
      condition: 'GBPUSD trades at 1.2700',
      instrument: 'GBPUSD',
      level: 1.27,
      channels: ['in-app'],
      status: 'paused',
      createdAt: minutesAgo(60 * 24 * 6, now),
    },
    {
      id: 'al_half',
      kind: 'loss-limit',
      name: 'Half of daily loss limit used',
      condition: '50% of your 5% daily loss limit is used',
      thresholdPct: 50,
      channels: ['in-app', 'push', 'email'],
      status: 'active',
      createdAt: minutesAgo(60 * 24 * 20, now),
    },
    {
      id: 'al_most',
      kind: 'loss-limit',
      name: 'Most of daily loss limit used',
      condition: '80% of your 5% daily loss limit is used',
      thresholdPct: 80,
      channels: ['in-app', 'push', 'email'],
      status: 'active',
      createdAt: minutesAgo(60 * 24 * 20, now),
    },
    {
      id: 'al_release',
      kind: 'release',
      name: 'High-impact release in 10 minutes',
      condition: 'A high-impact release is 10 minutes away',
      channels: ['in-app', 'push'],
      status: 'active',
      lastTriggeredAt: minutesAgo(70, now),
      createdAt: minutesAgo(60 * 24 * 20, now),
    },
    {
      id: 'al_session',
      kind: 'session-rule',
      name: 'Trading outside your session rule',
      condition: 'A trade opens outside London 07:00 to 16:30',
      channels: ['in-app', 'email'],
      status: 'triggered',
      lastTriggeredAt: minutesAgo(60 * 21, now),
      createdAt: minutesAgo(60 * 24 * 20, now),
    },
  ];
}

export function seedNotifications(now: number): Notification[] {
  return [
    {
      id: 'nt_1',
      title: 'Release in 10 minutes',
      body: 'USD core PCE price index at 13:30. Rule 4: no new trades 10 minutes either side.',
      severity: 'info',
      at: minutesAgo(12, now),
      read: false,
      href: '/desk',
    },
    {
      id: 'nt_2',
      title: 'Session recap ready for approval',
      body: 'The email to Jordan Ellis is waiting for you. Nothing is sent until you approve.',
      severity: 'info',
      at: minutesAgo(35, now),
      read: false,
      href: '/approvals',
    },
    {
      id: 'nt_3',
      title: 'Workflow stopped instead of guessing',
      body: 'Swap rates to costs sheet: the broker page layout changed, so the figures could not be read reliably.',
      severity: 'critical',
      at: minutesAgo(190, now),
      read: false,
      href: '/workflows/aut_swaps',
    },
    {
      id: 'nt_4',
      title: 'Trade outside your session rule',
      body: 'EURUSD short opened at 16:42 yesterday, after your 16:30 session end (Rule 2).',
      severity: 'warning',
      at: minutesAgo(60 * 21, now),
      read: true,
      href: '/alerts',
    },
    {
      id: 'nt_5',
      title: 'MetaTrader 5 sync complete',
      body: '14 new records fetched read-only and added to your twin’s knowledge.',
      severity: 'info',
      at: minutesAgo(60 * 22, now),
      read: true,
      href: '/sources',
    },
  ];
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export function seedApprovals(user: User, now: number): Approval[] {
  const firstName = user.name.split(' ')[0] ?? user.name;
  const approvals: Approval[] = [
    {
      id: 'apr_recap_today',
      kind: 'email',
      title: 'Session recap to your coach',
      summary: 'Today’s trades tagged against your rules, with a one-page summary attached.',
      recipients: [{ name: 'Jordan Ellis', address: 'jordan.ellis@coach.example' }],
      subject: 'Session recap',
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
        firstName,
      ].join('\n'),
      attachments: [{ name: 'session-recap.pdf', size: '1 page' }],
      origin: 'Session recap (/recap)',
      createdAt: minutesAgo(35, now),
      status: 'pending',
      checks: passedChecks(),
    },
    {
      id: 'apr_invite_fri',
      kind: 'calendar-invite',
      title: 'Friday review with Jordan',
      summary: 'A 30-minute call on Friday at 17:30 to go through the weekly review.',
      recipients: [{ name: 'Jordan Ellis', address: 'jordan.ellis@coach.example' }],
      subject: 'Weekly review',
      body: 'Friday, 17:30 to 18:00 (UK time)\nVideo call link added when you approve.\n\nAgenda: trades after 16:00 this week, and the release-window trade on Wednesday.',
      attachments: [],
      origin: 'Asked in the twin: “block Friday afternoon for a review with Jordan”',
      createdAt: minutesAgo(80, now),
      status: 'pending',
      checks: passedChecks(),
    },
    {
      id: 'apr_support_10482',
      kind: 'support-reply',
      title: 'Reply to trader 10482: “Why was my account closed?”',
      summary: 'Prepared from the breach record and rule version 3, in approved wording.',
      recipients: [{ name: 'Trader 10482', address: 'support-ticket-58213' }],
      subject: 'Re: Why was my account closed?',
      body: 'Your account crossed the 10% maximum drawdown at 14:02:17 UK time, on version 3 of the rule. Equity was £89,996 against a floor of £90,000. The full breach record is in your dashboard under BR-20391.\n\nIf you think the record is wrong, the dispute route is set out in section 7 of the rules.',
      attachments: [{ name: 'BR-20391.pdf', size: '3 pages' }],
      origin: 'Support desk, ticket 58213',
      createdAt: minutesAgo(140, now),
      status: 'pending',
      checks: passedChecks(),
    },
    {
      id: 'apr_weekly_prev',
      kind: 'email',
      title: 'Weekly review to your coach',
      summary: 'Last week’s trades against your rules, with patterns described.',
      recipients: [{ name: 'Jordan Ellis', address: 'jordan.ellis@coach.example' }],
      subject: 'Weekly review',
      body: 'Hi Jordan,\n\nLast week: 15 trades, 13 within my rules. Both exceptions were after 16:00.\n\nReview attached.',
      attachments: [{ name: 'weekly-review.pdf', size: '2 pages' }],
      origin: 'Weekly review',
      createdAt: minutesAgo(60 * 24 * 6, now),
      status: 'approved',
      decidedBy: user.name,
      decidedAt: minutesAgo(60 * 24 * 6 - 12, now),
      checks: passedChecks(),
    },
  ];
  if (user.role === 'trader') return approvals.filter((a) => a.kind !== 'support-reply');
  return approvals;
}

// ---------------------------------------------------------------------------
// Connected sources
// ---------------------------------------------------------------------------

export function seedSources(now: number): ConnectedSource[] {
  const src = (
    s: Omit<ConnectedSource, 'staleAfterHours'> & { staleAfterHours?: number },
  ): ConnectedSource => ({
    staleAfterHours: 24,
    ...s,
  });
  return [
    src({
      id: 'src_mt5',
      provider: 'mt5',
      name: 'MetaTrader 5',
      category: 'platform',
      description: 'Account history, positions and symbols from your terminal.',
      status: 'connected',
      authMethod: 'api-key',
      access: 'read-only',
      scopes: ['Account history', 'Open positions (read)', 'Symbols and watchlist'],
      lastSyncAt: minutesAgo(6, now),
      recordCount: 1284,
      staleAfterHours: 1,
    }),
    src({
      id: 'src_ctrader',
      provider: 'ctrader',
      name: 'cTrader',
      category: 'platform',
      description: 'Trades and account state through cTrader Open API.',
      status: 'connected',
      authMethod: 'oauth',
      access: 'read-only',
      scopes: ['Accounts (read)', 'Trading history (read)'],
      lastSyncAt: minutesAgo(64, now),
      recordCount: 312,
      staleAfterHours: 2,
    }),
    src({
      id: 'src_dxtrade',
      provider: 'dxtrade',
      name: 'DXtrade',
      category: 'platform',
      description: 'Accounts and trade history from DXtrade.',
      status: 'not-connected',
      authMethod: 'api-key',
      access: 'read-only',
      scopes: [],
    }),
    src({
      id: 'src_tv',
      provider: 'tradingview',
      name: 'TradingView',
      category: 'platform',
      description: 'Alerts and watchlists from your TradingView account.',
      status: 'connected',
      authMethod: 'api-key',
      access: 'read-only',
      scopes: ['Alert webhooks (read)', 'Watchlists'],
      lastSyncAt: minutesAgo(22, now),
      recordCount: 46,
    }),
    src({
      id: 'src_broker',
      provider: 'broker-api',
      name: 'Broker REST and FIX drop copy',
      category: 'platform',
      description: 'Statements and executions from your broker.',
      status: 'not-connected',
      authMethod: 'api-key',
      access: 'read-only',
      scopes: [],
    }),
    src({
      id: 'src_prices',
      provider: 'price-feed',
      name: 'Your price feed',
      category: 'market-data',
      description: 'Prices for alerts and rule watch, under your own licence.',
      status: 'connected',
      authMethod: 'api-key',
      access: 'read-only',
      scopes: ['Quotes (read)', 'Bars (read)'],
      lastSyncAt: minutesAgo(0.2, now),
      recordCount: 18_420,
      staleAfterHours: 0.1,
    }),
    src({
      id: 'src_cal',
      provider: 'econ-calendar',
      name: 'Economic calendar provider',
      category: 'market-data',
      description: 'Scheduled releases with previous figures and consensus.',
      status: 'connected',
      authMethod: 'api-key',
      access: 'read-only',
      scopes: ['Calendar (read)'],
      lastSyncAt: minutesAgo(31, now),
      recordCount: 214,
      staleAfterHours: 12,
    }),
    src({
      id: 'src_news',
      provider: 'news-feed',
      name: 'News feed you license',
      category: 'market-data',
      description: 'Headlines for the instruments you follow.',
      status: 'connected',
      authMethod: 'api-key',
      access: 'read-only',
      scopes: ['Headlines (read)'],
      lastSyncAt: minutesAgo(4, now),
      recordCount: 932,
      staleAfterHours: 1,
    }),
    src({
      id: 'src_google',
      provider: 'google-workspace',
      name: 'Google Workspace',
      category: 'your-day',
      description: 'Your calendar, and email drafts that wait for approval.',
      status: 'connected',
      authMethod: 'oauth',
      access: 'scoped-write',
      scopes: [
        'Calendar events (your calendar)',
        'Gmail drafts (sent only after approval)',
        'Sheets (selected files)',
      ],
      lastSyncAt: minutesAgo(9, now),
      recordCount: 87,
    }),
    src({
      id: 'src_ms',
      provider: 'microsoft-365',
      name: 'Microsoft 365',
      category: 'your-day',
      description: 'Outlook calendar and mail drafts.',
      status: 'not-connected',
      authMethod: 'oauth',
      access: 'scoped-write',
      scopes: [],
    }),
    src({
      id: 'src_journal',
      provider: 'journal',
      name: 'Trading journal',
      category: 'your-day',
      description: 'Your notes and session write-ups.',
      status: 'connected',
      authMethod: 'oauth',
      access: 'scoped-write',
      scopes: ['Journal entries'],
      lastSyncAt: minutesAgo(140, now),
      recordCount: 406,
    }),
    src({
      id: 'src_docs',
      provider: 'documents',
      name: 'Notes and documents',
      category: 'your-day',
      description: 'Your written rules and the documents you upload.',
      status: 'connected',
      authMethod: 'file-upload',
      access: 'read-only',
      scopes: ['Uploaded files'],
      lastSyncAt: minutesAgo(60 * 24 * 16, now),
      recordCount: 12,
      staleAfterHours: 24 * 90,
    }),
    src({
      id: 'src_rules',
      provider: 'rule-engine',
      name: 'Rule engine and risk system',
      category: 'firm-systems',
      description: 'Rule versions, breach records and limits per account.',
      status: 'connected',
      authMethod: 'api-key',
      access: 'read-only',
      scopes: ['Rules (read)', 'Breach records (read)'],
      lastSyncAt: minutesAgo(2, now),
      recordCount: 5_112,
      staleAfterHours: 1,
    }),
    src({
      id: 'src_crm',
      provider: 'crm',
      name: 'CRM and support desk',
      category: 'firm-systems',
      description: 'Tickets and client context for prepared replies.',
      status: 'not-connected',
      authMethod: 'oauth',
      access: 'scoped-write',
      scopes: [],
    }),
    src({
      id: 'src_dw',
      provider: 'warehouse',
      name: 'Data warehouse',
      category: 'firm-systems',
      description: 'Read-only views your team has approved.',
      status: 'error',
      authMethod: 'api-key',
      access: 'read-only',
      scopes: ['Approved views (read)'],
      lastSyncAt: minutesAgo(60 * 50, now),
      recordCount: 0,
      errorMessage: 'The credentials expired 2 days ago. Reconnect to resume fetching.',
    }),
  ];
}

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

export function seedAudit(
  tenantId: string,
  users: ReadonlyArray<Pick<User, 'id' | 'name' | 'role'>>,
  now: number,
): AuditEvent[] {
  const rand = seededRandom(20391);
  const twin = { id: 'twin', name: 'Desk Twin', role: 'twin' as const };
  const system = { id: 'system', name: 'System', role: 'system' as const };
  const templates: Array<
    (u: Pick<User, 'id' | 'name' | 'role'>) => Omit<AuditEvent, 'id' | 'at' | 'tenantId'>
  > = [
    (u) => ({
      actor: u,
      action: 'auth.login',
      outcome: 'success',
      summary: 'Signed in with password and authenticator code',
    }),
    (u) => ({
      actor: twin,
      action: 'twin.answer',
      outcome: 'success',
      summary: `Answered ${u.name.split(' ')[0]}: “How close am I to my daily limit?” (8 of 8 checks)`,
      ref: 'DT-4QW9ZM',
    }),
    (u) => ({
      actor: twin,
      action: 'twin.refused',
      outcome: 'blocked',
      summary: `Declined ${u.name.split(' ')[0]}: “Should I buy EURUSD now?” First draft blocked by the forecast check`,
      ref: 'DT-K7P2QA',
    }),
    (u) => ({
      actor: u,
      action: 'approval.approved',
      outcome: 'success',
      summary: 'Approved email “Weekly review” to Jordan Ellis',
      ref: 'apr_weekly_prev',
    }),
    () => ({
      actor: system,
      action: 'automation.run',
      outcome: 'success',
      summary: 'Morning events ran: 5 steps, 2 sources, 2 destinations',
      ref: 'aut_events',
    }),
    () => ({
      actor: system,
      action: 'automation.run',
      outcome: 'failure',
      summary: 'Swap rates to costs sheet stopped: page layout changed',
      ref: 'aut_swaps',
    }),
    (u) => ({
      actor: u,
      action: 'source.connected',
      outcome: 'success',
      summary: 'Connected TradingView, read-only, 2 scopes',
      ref: 'src_tv',
    }),
    () => ({
      actor: { id: 'unknown', name: 'Unknown', role: 'system' },
      action: 'auth.failed',
      outcome: 'failure',
      summary: 'Failed sign-in for a demo address from a new device',
    }),
    (u) => ({
      actor: u,
      action: 'settings.changed',
      outcome: 'success',
      summary: 'Changed idle sign-out from 30 to 15 minutes',
    }),
    (u) => ({
      actor: twin,
      action: 'twin.answer',
      outcome: 'success',
      summary: `Ran /prep for ${u.name.split(' ')[0]} (3 cited passages, 8 of 8 checks)`,
      ref: 'DT-9H2KXT',
    }),
    (u) => ({
      actor: u,
      action: 'alert.created',
      outcome: 'success',
      summary: 'Created price alert EURUSD at 1.0900',
      ref: 'al_eurusd',
    }),
    (u) => ({
      actor: twin,
      action: 'twin.refused',
      outcome: 'blocked',
      summary: `Declined ${u.name.split(' ')[0]}: message tried to override the twin’s rules (logged as injection attempt)`,
      ref: 'DT-ZP3M8R',
    }),
    (u) => ({ actor: u, action: 'auth.logout', outcome: 'success', summary: 'Signed out' }),
  ];
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const answerRef = () =>
    `DT-${Array.from({ length: 6 }, () => alphabet[Math.floor(rand() * alphabet.length)]).join('')}`;
  const events: AuditEvent[] = [];
  let at = now - 4 * 60_000;
  for (let i = 0; i < 46; i += 1) {
    const user = users[Math.floor(rand() * users.length)] ?? users[0];
    const template = templates[Math.floor(rand() * templates.length)];
    if (!user || !template) continue;
    const event = template(user);
    // Every answer has its own id, so searching one returns exactly one record.
    if (event.ref?.startsWith('DT-')) event.ref = answerRef();
    events.push({
      id: `aud_${(1000 + i).toString(36)}`,
      at: new Date(at).toISOString(),
      tenantId,
      ...event,
    });
    at -= Math.round((20 + rand() * 200) * 60_000);
  }
  return events;
}
