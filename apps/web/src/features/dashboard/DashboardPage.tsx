import { ArrowRight, Clock, Gauge, Inbox, Sparkles, TrendingDown } from 'lucide-react';
import { useNavigate } from 'react-router';
import { DESK_LABELS, formatLongDate, formatPct, hourIn } from '@twindesk/core';
import { usePendingApprovalCount } from '@/features/approvals/queries';
import { useAuth } from '@/features/auth/use-auth';
import { useTenant } from '@/features/tenant/tenant-context';
import { Page, PageHeader } from '@/shared/components/PageHeader';
import { QueryView } from '@/shared/components/QueryView';
import { useLocale } from '@/shared/hooks/use-locale';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Meter, Skeleton } from '@/shared/ui/feedback';
import {
  ActionItemsCard,
  EventsCard,
  NewsCard,
  RoutineCard,
  RuleWatchCard,
  StatTile,
} from './DeskCards';
import { useOverview } from './queries';
import { usageTone } from './usage-tone';

function greeting(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function minutesNow(timezone: string) {
  const [h = 0, m = 0] = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: timezone,
  })
    .format(new Date())
    .split(':')
    .map(Number);
  return h * 60 + m;
}

export function DashboardPage() {
  const overview = useOverview();
  const { user } = useAuth();
  const { tenant, isEnabled } = useTenant();
  const locale = useLocale();
  const navigate = useNavigate();
  const pending = usePendingApprovalCount();
  if (!user) return null;

  const firstName = user.name.split(' ')[0];
  const desk = DESK_LABELS[user.deskType];

  return (
    <Page className="space-y-6">
      <PageHeader
        eyebrow={`${formatLongDate(new Date(), locale)} · ${desk.short}`}
        title={`${greeting(hourIn(locale.timezone))}, ${firstName}`}
        description={`Here is your desk today. ${tenant.productName} handles the preparation, paperwork and reminders around your trading; the decisions stay with you.`}
        actions={
          isEnabled('twin') ? (
            <>
              <Button
                className="font-mono"
                onClick={() =>
                  void navigate('/twin', { state: { prompt: '/prep', autoSend: true } })
                }
              >
                /prep
              </Button>
              <Button variant="primary" onClick={() => void navigate('/twin')}>
                <Sparkles aria-hidden /> Ask the twin
              </Button>
            </>
          ) : null
        }
      />

      <QueryView query={overview} loading={<DashboardSkeleton />}>
        {(data) => {
          const w = data.ruleWatch;
          const dailyTone = usageTone(w.dailyLossUsedPct, w.dailyLossLimitPct);
          return (
            <>
              <section aria-label="At a glance" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile
                  label="Daily loss used"
                  value={formatPct(w.dailyLossUsedPct, locale)}
                  hint={`of your ${formatPct(w.dailyLossLimitPct, locale, 0)} limit`}
                  icon={Gauge}
                >
                  <Meter
                    value={w.dailyLossUsedPct}
                    max={w.dailyLossLimitPct}
                    tone={dailyTone}
                    label="Daily loss limit used"
                    markers={[w.dailyLossLimitPct * 0.5, w.dailyLossLimitPct * 0.8]}
                  />
                </StatTile>
                <StatTile
                  label="Drawdown headroom"
                  value={formatPct(w.maxDrawdownPct - w.drawdownUsedPct, locale)}
                  hint={`${formatPct(w.drawdownUsedPct, locale)} used of ${formatPct(w.maxDrawdownPct, locale, 0)}`}
                  icon={TrendingDown}
                />
                <StatTile
                  label="Waiting for your approval"
                  value={String(pending)}
                  hint={pending ? 'Nothing is sent until you approve' : 'Nothing waiting'}
                  icon={Inbox}
                  to={isEnabled('approvals') ? '/approvals' : undefined}
                />
                <StatTile
                  label="Time handed back this week"
                  value={`${Math.floor(data.timeSavedThisWeek.minutes / 60)}h ${data.timeSavedThisWeek.minutes % 60}m`}
                  hint={`${data.timeSavedThisWeek.runs} runs, every one logged`}
                  icon={Clock}
                />
              </section>

              <div className="grid gap-6 xl:grid-cols-12">
                <div className="xl:col-span-8">
                  <RuleWatchCard watch={w} locale={locale} />
                </div>
                <div className="xl:col-span-4">
                  <ActionItemsCard items={data.actionItems} />
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-12">
                <div className="lg:col-span-7">
                  <RoutineCard routine={data.routine} deskLabel={desk.long} />
                </div>
                <div className="flex flex-col gap-6 lg:col-span-5">
                  <EventsCard events={data.events} nowMinutes={minutesNow(locale.timezone)} />
                  <NewsCard news={data.news} locale={locale} />
                </div>
              </div>

              <Card className="relative overflow-hidden p-5 sm:p-6">
                <div aria-hidden className="absolute inset-0 opacity-70 hero-glow" />
                <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-mono text-[11px] tracking-[0.16em] text-brand-fg uppercase">
                      Your time goes to
                    </p>
                    <p className="mt-1.5 text-lg font-semibold text-fg">Your trading decisions.</p>
                    <p className="mt-1 max-w-xl text-sm text-fg-muted">
                      The twin handles the preparation, paperwork and reminders around them.
                    </p>
                  </div>
                  <ul className="flex flex-wrap gap-2" aria-label="Off your plate">
                    {data.offYourPlate.map((item) => (
                      <li
                        key={item}
                        className="rounded-full border border-line bg-surface/70 px-3 py-1.5 text-[12.5px] text-fg-muted line-through decoration-fg-subtle/60"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                  {isEnabled('tasks') ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void navigate('/tasks')}
                      className="self-start md:self-center"
                    >
                      Hand over a job <ArrowRight aria-hidden />
                    </Button>
                  ) : null}
                </div>
              </Card>
            </>
          );
        }}
      </QueryView>
    </Page>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-12">
        <Skeleton className="h-[420px] rounded-2xl xl:col-span-8" />
        <Skeleton className="h-[420px] rounded-2xl xl:col-span-4" />
      </div>
    </div>
  );
}
