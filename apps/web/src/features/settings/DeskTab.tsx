import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  CodeXml,
  FlaskConical,
  GraduationCap,
  Landmark,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { DESK_LABELS, DESK_TYPES, type DeskType } from '@twindesk/core';
import { qk } from '@/app/query-keys';
import { useSessionStore } from '@/features/auth/session-store';
import { useAuth } from '@/features/auth/use-auth';
import { cn } from '@/lib/cn';
import { toastError } from '@/lib/mutation';
import { useApi } from '@/platform/api-context';
import { Spinner } from '@/shared/ui/feedback';
import { toast } from '@/shared/ui/toast';
import { SettingSection } from './SettingSection';

const DESK_DETAILS: Record<DeskType, { icon: LucideIcon; body: string }> = {
  'independent-trader': {
    icon: UserRound,
    body: 'Session prep, rule watch and recaps around your own trading.',
  },
  'prop-firm': {
    icon: Building2,
    body: 'Breach evidence, payout checks and trader replies in approved wording.',
  },
  broker: {
    icon: Landmark,
    body: 'Client answers from their own account, and commentary checked against your wording rules.',
  },
  'trading-education': {
    icon: GraduationCap,
    body: 'Lessons and student questions answered without trade calls.',
  },
  'fintech-engineering': {
    icon: CodeXml,
    body: 'Provider changes, integration checks and feed health.',
  },
  'research-quant': {
    icon: FlaskConical,
    body: 'Data quality, research digests and experiment logs.',
  },
};

export function DeskTab() {
  const api = useApi();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const change = useMutation({
    mutationFn: (deskType: DeskType) => api.desk.setDeskType(deskType),
    onSuccess: (session) => {
      useSessionStore.getState().setSession(session);
      void queryClient.invalidateQueries({ queryKey: qk.overview });
      void queryClient.invalidateQueries({ queryKey: ['twin', 'suggestions'] });
      toast.success('Desk updated', `Set up for ${DESK_LABELS[session.user.deskType].long}.`);
    },
    onError: toastError('Could not change the desk'),
  });
  if (!user) return null;
  const pendingDesk = change.isPending ? change.variables : undefined;

  return (
    <SettingSection
      title="Built around your desk"
      description="The same twin, configured around a different day. Your desk sets the routine on Today, the suggested questions and the shortcuts it offers first."
    >
      <fieldset>
        <legend className="sr-only">Desk type</legend>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {DESK_TYPES.map((desk) => {
            const { icon: Icon, body } = DESK_DETAILS[desk];
            const selected = user.deskType === desk;
            return (
              <label
                key={desk}
                className={cn(
                  'relative flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-brand/30',
                  selected
                    ? 'border-brand-fg/50 bg-brand/8'
                    : 'border-line bg-surface-2/30 hover:border-line-strong',
                )}
              >
                <input
                  type="radio"
                  name="desk"
                  value={desk}
                  checked={selected}
                  disabled={change.isPending}
                  onChange={() => change.mutate(desk)}
                  className="sr-only"
                />
                <span
                  className={cn(
                    'grid size-9 shrink-0 place-items-center rounded-lg border',
                    selected
                      ? 'border-transparent bg-brand text-on-brand'
                      : 'border-line bg-surface text-fg-muted',
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-[13.5px] font-semibold text-fg">
                    {DESK_LABELS[desk].short}
                    {pendingDesk === desk ? <Spinner label="Saving" /> : null}
                  </span>
                  <span className="mt-1 block text-[12.5px] leading-relaxed text-fg-muted">
                    {body}
                  </span>
                </span>
                {selected ? (
                  <span className="absolute top-3 right-3 font-mono text-[10px] tracking-[0.14em] text-brand-fg uppercase">
                    Current
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>
      </fieldset>
    </SettingSection>
  );
}
