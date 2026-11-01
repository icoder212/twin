import { CircleCheck, ListChecks, ShieldCheck, Workflow } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { sanitizeText, type AutomationKind, type AutomationPlan } from '@twindesk/core';
import { useAuth } from '@/features/auth/use-auth';
import { cn } from '@/lib/cn';
import { Page, PageHeader } from '@/shared/components/PageHeader';
import { QueryView } from '@/shared/components/QueryView';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { EmptyState, Skeleton } from '@/shared/ui/feedback';
import { AutomationCard } from './components/AutomationCard';
import { PlanComposer } from './components/PlanComposer';
import { PlanReviewDialog } from './components/PlanReviewDialog';
import { automationPath, HOW_TASKS_WORK, KIND_COPY, WORKFLOW_RULES } from './labels';
import { useAutomations } from './queries';

type Filter = 'all' | 'active' | 'paused';

const HEADER: Record<AutomationKind, { eyebrow: string; title: string; description: string }> = {
  task: {
    eyebrow: 'Say it once',
    title: 'Say it once. It becomes a task.',
    description:
      'Describe a job in plain English, once. Your twin writes the steps, asks what it needs, and saves it as a regular task. After that it is one click, or no click at all.',
  },
  workflow: {
    eyebrow: 'Workflow automation',
    title: 'From one source to the next system, without you in the middle',
    description:
      'Tell it the outcome. Your twin plans the steps across websites, platforms and your tools, reads from each, checks the data, and puts the result where it belongs. No copying between tabs.',
  },
};

function readInstruction(state: unknown): string {
  const value = (state as { instruction?: unknown } | null)?.instruction;
  return typeof value === 'string' ? sanitizeText(value, { maxLength: 1000 }) : '';
}

function ListSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} className="space-y-3 p-5">
          <div className="flex gap-3">
            <Skeleton className="size-9 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          </div>
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-8 w-40" />
        </Card>
      ))}
    </div>
  );
}

function HowItWorks() {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>How a task comes together</CardTitle>
          <CardDescription>From one sentence to a job that runs on its own.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-4">
          {HOW_TASKS_WORK.map((step) => (
            <li key={step.n} className="flex gap-3">
              <span className="font-mono text-xs font-semibold text-brand-fg">{step.n}</span>
              <div>
                <p className="text-[13px] font-semibold text-fg">{step.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function WorkflowRules() {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>How every workflow runs</CardTitle>
          <CardDescription>The same controls on every run, whoever set it up.</CardDescription>
        </div>
        <ShieldCheck className="size-5 shrink-0 text-success" aria-hidden />
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-3">
          {WORKFLOW_RULES.map((rule) => (
            <li key={rule} className="flex gap-2.5 text-[13px] leading-relaxed text-fg-muted">
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
              {rule}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function AutomationsView({ kind }: { kind: AutomationKind }) {
  const copy = KIND_COPY[kind];
  const header = HEADER[kind];
  const location = useLocation();
  const navigate = useNavigate();
  const { can } = useAuth();
  const query = useAutomations(kind);
  const [plan, setPlan] = useState<AutomationPlan | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const initialInstruction = readInstruction(location.state);
  const canManage = can(copy.permission);

  const counts = {
    all: query.data?.length ?? 0,
    active: query.data?.filter((a) => a.status === 'active').length ?? 0,
    paused: query.data?.filter((a) => a.status === 'paused').length ?? 0,
  };

  return (
    <Page>
      <PageHeader eyebrow={header.eyebrow} title={header.title} description={header.description} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        {canManage ? (
          <PlanComposer
            key={initialInstruction}
            kind={kind}
            initialInstruction={initialInstruction}
            onPlanned={setPlan}
          />
        ) : (
          <Card className="flex items-start gap-3 p-5">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-fg-subtle" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-fg">View only for your role</p>
              <p className="mt-1 text-[13px] text-fg-muted">
                You can see every {copy.singular} and its run history. Creating and running them is
                limited to the people who own the desk.
              </p>
            </div>
          </Card>
        )}
        {kind === 'task' ? <HowItWorks /> : <WorkflowRules />}
      </div>

      <section aria-labelledby="saved-heading" className="mt-10">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="saved-heading" className="text-lg font-semibold tracking-tight text-fg">
              Your {copy.plural.toLowerCase()}
            </h2>
            <p className="text-[13px] text-fg-muted">
              {kind === 'task'
                ? 'Each one runs on its schedule, from its shortcut, or when you press Run now.'
                : 'Each one reads only the sources you allowed and writes only where you said.'}
            </p>
          </div>
          <div
            role="group"
            aria-label={`Filter ${copy.plural.toLowerCase()}`}
            className="inline-flex self-start rounded-xl border border-line bg-surface p-1"
          >
            {(['all', 'active', 'paused'] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={cn(
                  'h-8 rounded-lg px-3 text-[13px] font-medium capitalize transition-colors',
                  filter === f ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:text-fg',
                )}
              >
                {f} <span className="font-mono text-[11px] text-fg-subtle">{counts[f]}</span>
              </button>
            ))}
          </div>
        </div>

        <QueryView query={query} loading={<ListSkeleton />}>
          {(items) => {
            const shown = filter === 'all' ? items : items.filter((a) => a.status === filter);
            if (shown.length === 0) {
              return (
                <Card>
                  <EmptyState
                    icon={kind === 'task' ? ListChecks : Workflow}
                    title={
                      filter === 'all'
                        ? `No ${copy.plural.toLowerCase()} yet`
                        : `No ${filter} ${copy.plural.toLowerCase()}`
                    }
                    description={
                      filter === 'all'
                        ? `Describe a job above and your twin will plan it. ${kind === 'task' ? 'Tasks' : 'Workflows'} you save appear here.`
                        : undefined
                    }
                  />
                </Card>
              );
            }
            return (
              <ul className="grid gap-4 md:grid-cols-2">
                {shown.map((a) => (
                  <li key={a.id} className="flex">
                    <AutomationCard automation={a} />
                  </li>
                ))}
              </ul>
            );
          }}
        </QueryView>

        {kind === 'workflow' ? (
          <p className="mt-6 text-xs text-fg-subtle">
            Firm-wide back-office workflows, such as reconciliations and onboarding, are set up with
            your administrator. Prefer one sentence and a schedule?{' '}
            <Link to="/tasks" className="text-brand-fg hover:underline">
              Build a task instead
            </Link>
            .
          </p>
        ) : null}
      </section>

      <PlanReviewDialog
        plan={plan}
        onClose={() => setPlan(null)}
        onSaved={(saved) => {
          setPlan(null);
          void navigate(automationPath(saved));
        }}
      />
    </Page>
  );
}

export function TasksPage() {
  return <AutomationsView kind="task" />;
}

export function WorkflowsPage() {
  return <AutomationsView kind="workflow" />;
}
