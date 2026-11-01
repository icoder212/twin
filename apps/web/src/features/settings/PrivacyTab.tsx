import { useQueryClient } from '@tanstack/react-query';
import { Brain, Eraser, FileDown, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { env } from '@/app/env';
import { useTenant } from '@/features/tenant/tenant-context';
import { useApi } from '@/platform/api-context';
import { Button } from '@/shared/ui/button';
import { ConfirmDialog } from '@/shared/ui/dialog';
import { toast } from '@/shared/ui/toast';
import { forgetConversation } from './forget-conversation';
import { SettingSection } from './SettingSection';

const REMEMBERS = [
  ['Your role and desk', 'Kept with your profile so the twin is set up for the job you do.'],
  ['Saved tasks, shortcuts and alerts', 'Stored with your account until you remove them.'],
  [
    'Connected sources',
    'Read-only records, each with its source, time and owner, marked with their age so nothing stale passes as current.',
  ],
  [
    'This conversation',
    'Held in memory in this tab only. It is cleared when you sign out, close the tab or choose “Forget this conversation”.',
  ],
] as const;

export function PrivacyTab() {
  const { tenant } = useTenant();
  const api = useApi();
  const queryClient = useQueryClient();
  const [confirmReset, setConfirmReset] = useState(false);

  const forget = () => {
    if (forgetConversation())
      toast.success('Conversation forgotten', 'Nothing from it remains in this tab.');
    else toast.info('Nothing to forget', 'There is no conversation held in this tab.');
  };

  const resetDemo = () => {
    api.resetDemoData?.();
    queryClient.clear();
    window.location.reload();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <SettingSection
        title="What the twin remembers"
        description="Your material is searched when the twin answers and never used to train a model."
        actions={
          <Button size="sm" onClick={forget}>
            <Eraser /> Forget this conversation
          </Button>
        }
      >
        <ul className="space-y-3">
          {REMEMBERS.map(([title, body]) => (
            <li key={title} className="flex gap-3">
              <Brain className="mt-0.5 size-4 shrink-0 text-brand-fg" aria-hidden />
              <div>
                <p className="text-[13px] font-semibold text-fg">{title}</p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-fg-muted">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </SettingSection>

      <div className="space-y-6">
        <SettingSection
          title="Export or delete your data"
          description="Handled by your firm under UK GDPR, with a data processing agreement that sets out who does what."
        >
          <div className="flex gap-3 rounded-xl border border-line bg-surface-2/40 p-4">
            <FileDown className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            <p className="text-[13px] leading-relaxed text-fg-muted">
              To request a copy of your data or ask for it to be deleted, contact{' '}
              <span className="font-medium text-fg">{tenant.legal.supportEmail}</span>. Requests are
              logged, and audit records are kept for as long as your compliance team requires.
            </p>
          </div>
        </SettingSection>

        {env.demoMode ? (
          <SettingSection
            title="Demo data"
            description="This build runs on synthetic sample data held in this browser tab. Resetting restores the original sample desk."
            actions={
              <Button size="sm" variant="danger" onClick={() => setConfirmReset(true)}>
                <RotateCcw /> Reset demo data
              </Button>
            }
          >
            <p className="text-[12.5px] leading-relaxed text-fg-subtle">
              Approvals, alerts, tasks and the audit log return to how they were at the start of the
              demo. You stay signed in.
            </p>
          </SettingSection>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset the demo data?"
        description="Every change made in this demo, including approvals and new alerts, is replaced with the original sample data."
        confirmLabel="Reset and reload"
        onConfirm={resetDemo}
      />
    </div>
  );
}
