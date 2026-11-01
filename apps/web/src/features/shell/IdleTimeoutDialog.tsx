import { Timer } from 'lucide-react';
import { useAuth } from '@/features/auth/use-auth';
import { useIdleTimeout } from '@/features/auth/use-idle-timeout';
import { useTenant } from '@/features/tenant/tenant-context';
import { useApi } from '@/platform/api-context';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';

export function IdleTimeoutDialog() {
  const { tenant } = useTenant();
  const { signOut, status } = useAuth();
  const api = useApi();
  const { warning, remainingMs, stayActive } = useIdleTimeout({
    enabled: status === 'authenticated',
    timeoutMs: tenant.security.idleTimeoutMinutes * 60_000,
    warningMs: tenant.security.idleWarningSeconds * 1000,
    onTimeout: () => void signOut('timeout'),
    onHeartbeat: () => void api.auth.touch().catch(() => undefined),
  });
  const seconds = Math.ceil(remainingMs / 1000);
  const label = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <Dialog
      open={warning}
      onOpenChange={() => undefined}
      dismissible={false}
      variant="center"
      size="sm"
      title="Are you still there?"
      description={`For your security, ${tenant.productName} signs out after ${tenant.security.idleTimeoutMinutes} minutes without activity.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => void signOut('user')}>
            Sign out now
          </Button>
          {/* eslint-disable-next-line jsx-a11y/no-autofocus -- WAI-ARIA: focus the least destructive action in an alert dialog */}
          <Button variant="primary" onClick={stayActive} autoFocus>
            Stay signed in
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/10 p-3">
        <Timer className="size-5 text-warning" aria-hidden />
        <p className="text-sm text-fg" aria-live="polite">
          Signing out in <span className="font-mono font-semibold tabular">{label}</span>
        </p>
      </div>
    </Dialog>
  );
}
