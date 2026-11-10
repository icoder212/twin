import { ShieldCheck, UserRound } from 'lucide-react';
import { buttonVariants, Button } from '@/shared/ui/button';
import { realSignInUrl, signOutRealAccount, useRealAccount } from './real-account';

/** On the Notifications page: switch between the demo's notifications and your real ones. */
export function RealAccountPanel() {
  const { availability, status } = useRealAccount();
  if (availability !== 'available') return null;

  if (!status.signedIn) {
    return (
      <section
        aria-label="Your real notifications"
        className="flex flex-col gap-3 rounded-xl border border-line bg-surface-2/60 p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <p className="flex gap-2.5 text-[13px] leading-relaxed text-fg-muted">
          <UserRound className="mt-0.5 size-4 shrink-0 text-brand-fg" aria-hidden />
          <span>
            <span className="font-medium text-fg">These are demo notifications.</span> Sign in with
            Google to see and control your real ones: meeting reminders, and everything sent to your
            WhatsApp and email.
          </span>
        </p>
        <a href={realSignInUrl()} className={buttonVariants({ variant: 'primary', size: 'sm' })}>
          Sign in with Google
        </a>
      </section>
    );
  }

  return (
    <section
      aria-label="Your real notifications"
      className="flex flex-col gap-3 rounded-xl border border-success/30 bg-success/10 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="flex gap-2.5 text-[13px] leading-relaxed text-fg-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
        <span>
          <span className="font-medium text-fg">
            Showing your real notifications{status.email ? ` for ${status.email}` : ''}.
          </span>{' '}
          Changes on these tabs decide what reaches your WhatsApp and email.
          {status.channels && !status.channels.email
            ? ' Email is not set up on the server yet, so it shows as unverified.'
            : ''}
        </span>
      </p>
      <Button variant="ghost" size="sm" onClick={() => void signOutRealAccount()}>
        Back to the demo
      </Button>
    </section>
  );
}
