import type {
  Automation,
  AutomationKind,
  AutomationPlan,
  AutomationStep,
} from '../domain/automation';
import { createId } from '../security/ids';

/**
 * Turns one plain-English instruction into a plan. The real planner is a model constrained to
 * this output schema; this heuristic version produces the same shape for the demo.
 */

const SOURCES: Array<[RegExp, string]> = [
  [/\b(mt5|metatrader)\b/i, 'MetaTrader 5'],
  [/\bctrader\b/i, 'cTrader'],
  [/\bdxtrade\b/i, 'DXtrade'],
  [/\btradingview\b/i, 'TradingView'],
  [/\b(economic calendar|releases?|events?)\b/i, 'Economic calendar'],
  [/\b(news|headlines?)\b/i, 'News feed'],
  [/\b(rules?)\b/i, 'Your rules'],
  [/\b(statements?)\b/i, 'Broker statements'],
  [/\b(swap rates?|website|page)\b/i, 'Broker website'],
  [/\b(trades?|history|positions?)\b/i, 'MetaTrader 5'],
];

const DESTINATIONS: Array<[RegExp, string, AutomationStep['verb'], boolean]> = [
  [/\b(email|e-mail|send)\b/i, 'Email', 'draft', true],
  [/\b(message|slack|teams)\b/i, 'Message', 'draft', true],
  [/\b(invite|invitation|meeting)\b/i, 'Calendar invite', 'draft', true],
  [/\b(calendar)\b/i, 'Google Calendar', 'write', false],
  [/\b(journal)\b/i, 'Journal', 'write', false],
  [/\b(sheet|spreadsheet)\b/i, 'Google Sheets', 'write', false],
  [/\b(list|action items?|to-?do)\b/i, 'Action items', 'write', false],
];

function scheduleFrom(text: string): Automation['schedule'] {
  const time =
    text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) ?? text.match(/\b(\d{1,2}):(\d{2})\b/);
  let hhmm: string | undefined;
  if (time) {
    let h = Number(time[1]);
    const m = time[2] ?? '00';
    const ampm = time[3]?.toLowerCase();
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    hhmm = `${String(h).padStart(2, '0')}:${m}`;
  }
  if (/\bfriday/i.test(text)) return { kind: 'schedule', label: `Fridays, ${hhmm ?? '17:00'}` };
  if (/\bmonday/i.test(text)) return { kind: 'schedule', label: `Mondays, ${hhmm ?? '07:30'}` };
  if (/\b(after (each|every|the) session|after the close)\b/i.test(text))
    return { kind: 'event', label: `After each session, ${hhmm ?? '16:45'}` };
  if (/\bwhen\b/i.test(text))
    return { kind: 'event', label: 'When the source changes, checked hourly' };
  if (
    /\b(every|each)\s+(week)?day|weekdays?|every morning|before (london|the) open|each morning\b/i.test(
      text,
    )
  ) {
    return { kind: 'schedule', label: `Weekdays, ${hhmm ?? '07:30'}` };
  }
  if (hhmm) return { kind: 'schedule', label: `Daily, ${hhmm}` };
  return { kind: 'manual', label: 'When you run it' };
}

function nameFrom(text: string, kind: AutomationKind): string {
  const known: Array<[RegExp, string]> = [
    [/\breview\b/i, 'Review'],
    [/\brecap\b/i, 'Session recap'],
    [/\b(prep|checklist)\b/i, 'Session prep'],
    [/\b(swap|costs?)\b/i, 'Costs update'],
    [/\b(releases?|events?|calendar)\b/i, 'Events to calendar'],
    [/\b(news|headlines?)\b/i, 'News brief'],
    [/\b(statements?)\b/i, 'Statement check'],
  ];
  const hit = known.find(([p]) => p.test(text));
  if (hit) return hit[1];
  const words = text
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 3);
  const name = words.join(' ') || (kind === 'task' ? 'New task' : 'New workflow');
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

export function planAutomation(
  kind: AutomationKind,
  instruction: string,
  now: Date,
): AutomationPlan {
  const id = createId('aut');
  const sources = [
    ...new Set(SOURCES.filter(([p]) => p.test(instruction)).map(([, s]) => s)),
  ].slice(0, 4);
  if (sources.length === 0) sources.push('Your rules');
  const destinations = DESTINATIONS.filter(([p]) => p.test(instruction));
  const uniqueDestinations = [...new Map(destinations.map((d) => [d[1], d])).values()].slice(0, 3);
  if (uniqueDestinations.length === 0)
    uniqueDestinations.push([/./, 'Action items', 'write', false]);

  const steps: AutomationStep[] = [];
  const add = (
    verb: AutomationStep['verb'],
    system: string,
    description: string,
    needsApproval = false,
  ) => steps.push({ id: `${id}_s${steps.length + 1}`, verb, system, description, needsApproval });

  const readDescription = (s: string) =>
    s === 'Broker website'
      ? 'Read the page, where the site’s terms permit'
      : s === 'Your rules'
        ? 'Read your written rules, current version'
        : `Read from ${s}, read-only`;
  for (const s of sources) add('read', s, readDescription(s));
  if (sources.includes('Your rules') || /\b(check|against|compare)\b/i.test(instruction)) {
    add(
      /\bcompare\b/i.test(instruction) ? 'compare' : 'check',
      'Desk Twin',
      /\bcompare\b/i.test(instruction)
        ? 'Compare with the previous run'
        : 'Check each item against your written rules, version 3',
    );
  }
  if (/\bmatch\b/i.test(instruction))
    add('match', 'Desk Twin', 'Match the results to your watchlist');
  for (const [, system, verb, needsApproval] of uniqueDestinations) {
    add(
      verb,
      system,
      needsApproval
        ? `Draft for ${system.toLowerCase()}, sent only after you approve`
        : `Write the result to ${system}`,
      needsApproval,
    );
  }
  if (/\bremind\b/i.test(instruction))
    add('remind', 'Google Calendar', 'Add a reminder to your calendar');

  const recipients: string[] = [];
  if (/\bcoach\b/i.test(instruction)) recipients.push('Jordan Ellis (coach)');
  if (/\b(risk team|risk desk)\b/i.test(instruction)) recipients.push('Risk team');
  const emails = instruction.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? [];
  recipients.push(...emails.slice(0, 3));

  const schedule = scheduleFrom(instruction);
  const questions: AutomationPlan['questions'] = [];
  if (sources.includes('MetaTrader 5')) {
    questions.push({
      id: 'account',
      question: 'Which account should it read from?',
      options: ['MT5 · Live 4471', 'MT5 · Demo 2290', 'Both'],
    });
  }
  if (steps.some((s) => s.needsApproval) && recipients.length === 0) {
    questions.push({
      id: 'recipient',
      question: 'Who should it go to?',
      options: ['Jordan Ellis (coach)', 'Risk team', 'Only me'],
    });
  }
  if (schedule.kind === 'manual') {
    questions.push({
      id: 'schedule',
      question: 'When should it run?',
      options: ['Weekdays, 07:30', 'Weekdays, 17:00', 'Fridays, 17:00', 'Only when I run it'],
    });
  }
  if (questions.length < 2 && sources.includes('Your rules')) {
    questions.push({
      id: 'rules',
      question: 'Which version of your rules?',
      options: ['Version 3 (current)', 'Version 2'],
    });
  }

  const draft: Automation = {
    id,
    kind,
    name: nameFrom(instruction, kind),
    instruction,
    schedule,
    sources,
    destinations: uniqueDestinations.map(([, s]) => s),
    steps: steps.slice(0, 20),
    recipients,
    status: 'draft',
    createdAt: now.toISOString(),
  };
  return { draft, questions: questions.slice(0, 3) };
}
