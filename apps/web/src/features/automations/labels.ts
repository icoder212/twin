import type {
  AutomationKind,
  Automation,
  AutomationRun,
  Permission,
  RunStatus,
  StepVerb,
  Tone,
} from '@twindesk/core';

export const VERB_LABELS: Record<StepVerb, { label: string; tone: Tone }> = {
  read: { label: 'Read', tone: 'info' },
  check: { label: 'Check', tone: 'brand' },
  match: { label: 'Match', tone: 'brand' },
  compare: { label: 'Compare', tone: 'brand' },
  write: { label: 'Write', tone: 'success' },
  draft: { label: 'Draft', tone: 'warning' },
  remind: { label: 'Remind', tone: 'neutral' },
};

export const RUN_STATUS: Record<RunStatus, { label: string; tone: Tone }> = {
  succeeded: { label: 'Succeeded', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  stopped: { label: 'Stopped instead of guessing', tone: 'danger' },
  'awaiting-approval': { label: 'Waiting for your approval', tone: 'warning' },
  running: { label: 'Running', tone: 'info' },
};

export const RUN_TRIGGER: Record<AutomationRun['trigger'], string> = {
  schedule: 'On schedule',
  manual: 'Run on request',
  shortcut: 'From its shortcut',
  event: 'When the source changed',
};

export const AUTOMATION_STATUS: Record<Automation['status'], { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'success' },
  paused: { label: 'Paused', tone: 'neutral' },
  draft: { label: 'Draft', tone: 'warning' },
};

export const KIND_COPY: Record<
  AutomationKind,
  { singular: string; plural: string; path: string; permission: Permission }
> = {
  task: { singular: 'task', plural: 'Tasks', path: '/tasks', permission: 'tasks.manage' },
  workflow: {
    singular: 'workflow',
    plural: 'Workflows',
    path: '/workflows',
    permission: 'workflows.manage',
  },
};

/** Step messages already end with the headline; banners show the explanation only. */
export function stopReason(message: string): string {
  return message.replace(/\s*Stopped instead of guessing\.?$/i, '');
}

export function automationPath(automation: Pick<Automation, 'id' | 'kind'>): string {
  return `${KIND_COPY[automation.kind].path}/${encodeURIComponent(automation.id)}`;
}

export interface ExampleInstruction {
  label: string;
  instruction: string;
}

export const EXAMPLES: Record<AutomationKind, ExampleInstruction[]> = {
  task: [
    {
      label: 'Morning review',
      instruction:
        'Every weekday before London opens, check yesterday against my rules, write it up, email it to my coach and remind me to read it.',
    },
    {
      label: 'Friday review',
      instruction:
        'Fridays at 5pm, review my week against my rules and email the summary to my coach.',
    },
    {
      label: 'Session recap',
      instruction:
        'After the session, tag today’s trades against my rules and add a summary to my journal.',
    },
  ],
  workflow: [
    {
      label: 'Morning events',
      instruction:
        'Every morning, read the economic calendar, match today’s releases to my watchlist, put them in my calendar and today’s list.',
    },
    {
      label: 'Swap rates to costs sheet',
      instruction:
        'When my broker updates its swap rates page, read it, compare with last week, and update my costs sheet.',
    },
    {
      label: 'Post-session journal',
      instruction:
        'After each session, pull my trades from cTrader, tag them against my rules, and add a summary to my journal.',
    },
  ],
};

/** The four steps from "say it once" to a job that runs on its own. */
export const HOW_TASKS_WORK = [
  {
    n: '01',
    title: 'Say it once',
    body: 'One instruction in your own words. No prompt engineering, no templates to fill in.',
  },
  {
    n: '02',
    title: 'Check the plan',
    body: 'The twin shows the steps, the schedule and who anything goes to, and asks two or three questions the first time.',
  },
  {
    n: '03',
    title: 'Let it run',
    body: 'On a schedule, with one click, or with its one-word shortcut. Open any task to change a step, a time or a recipient.',
  },
  {
    n: '04',
    title: 'Approve what leaves',
    body: 'Emails, messages and calendar invitations to anyone else wait for your approval, and everything it does is logged.',
  },
];

/** The six rules every workflow follows, from the product page. */
export const WORKFLOW_RULES = [
  'It shows the plan before the first run: every source, step and destination.',
  'It reads only the sources you allow, and prefers official APIs. Websites are read where their terms permit.',
  'Website text is treated as data, never as instructions.',
  'It writes only to destinations you allow, and never to orders, money or trading accounts.',
  'Anything going to another person waits for your approval.',
  'Every run is logged step by step. If a step fails or data looks wrong, it stops and tells you instead of guessing.',
];
