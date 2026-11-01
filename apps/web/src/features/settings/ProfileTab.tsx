import {
  CheckCircle2,
  Globe,
  KeyRound,
  Lock,
  LogOut,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import { formatDateTime, ROLE_LABELS } from '@twindesk/core';
import { useAuth } from '@/features/auth/use-auth';
import { useTenant } from '@/features/tenant/tenant-context';
import { useLocale } from '@/shared/hooks/use-locale';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Avatar } from '@/shared/ui/feedback';
import { FactList, SettingSection } from './SettingSection';

const POSTURE = [
  {
    icon: KeyRound,
    title: 'Read-only by default',
    body: 'Connected sources use read-only keys. The twin cannot place orders or move money.',
  },
  {
    icon: Sparkles,
    title: 'Never trained on you',
    body: 'Your material is searched when the twin answers and never used to train a model.',
  },
  {
    icon: Lock,
    title: 'Encrypted in transit and at rest',
    body: 'Secrets sit in a managed vault and never appear in a prompt or a log.',
  },
  {
    icon: ShieldCheck,
    title: 'UK GDPR terms',
    body: 'A data processing agreement sets out who does what. You can export or delete your data.',
  },
  {
    icon: Globe,
    title: 'Regional hosting',
    body: 'Hosted in the region your firm chooses, including the UK.',
  },
];

export function ProfileTab() {
  const { user, session, signOut } = useAuth();
  const { tenant } = useTenant();
  const locale = useLocale();
  if (!user || !session) return null;

  const method = session.authMethod === 'sso' ? 'Single sign-on' : 'Password and authenticator app';

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-6 lg:col-span-3">
        <SettingSection
          title="Profile"
          description={`Managed by ${tenant.name}’s identity provider. Ask an administrator to change these details.`}
        >
          <div className="mb-4 flex items-center gap-3">
            <Avatar name={user.name} className="size-11 text-sm" />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-fg">{user.name}</p>
              <p className="truncate text-[13px] text-fg-muted">
                {user.title ?? ROLE_LABELS[user.role]}
              </p>
            </div>
            <Badge tone="brand" className="ml-auto">
              {ROLE_LABELS[user.role]}
            </Badge>
          </div>
          <FactList
            items={[
              { label: 'Name', value: user.name },
              { label: 'Work email', value: user.email },
              { label: 'Role', value: ROLE_LABELS[user.role] },
              { label: 'Timezone', value: user.timezone },
            ]}
          />
        </SettingSection>

        <SettingSection
          title="This session"
          description="Sessions end after a period of inactivity and at a fixed time, whichever comes first."
          actions={
            <>
              <Button size="sm" onClick={() => void signOut('user')}>
                <LogOut /> Sign out
              </Button>
              <Button size="sm" variant="danger" onClick={() => void signOut('user')}>
                <Smartphone /> Sign out on all devices
              </Button>
            </>
          }
        >
          <FactList
            items={[
              { label: 'Sign-in method', value: method },
              {
                label: 'Two-step verification',
                value: session.mfaVerified ? (
                  <span className="inline-flex items-center gap-1.5 text-success">
                    <CheckCircle2 className="size-3.5" aria-hidden /> Verified
                  </span>
                ) : (
                  'Not verified'
                ),
              },
              {
                label: 'Session started',
                value: formatDateTime(new Date(session.issuedAt), locale),
              },
              {
                label: 'Ends at the latest',
                value: formatDateTime(new Date(session.expiresAt), locale),
              },
              {
                label: 'Idle sign-out',
                value: `After ${tenant.security.idleTimeoutMinutes} minutes without activity`,
              },
            ]}
          />
          <p className="mt-3 text-xs leading-relaxed text-fg-subtle">
            Signing out here also signs out every other tab on this device. In production, signing
            out on all devices also revokes your sessions on the server, so phones and other
            computers are signed out at their next request.
          </p>
        </SettingSection>
      </div>

      <div className="lg:col-span-2">
        <SettingSection
          title="How your data is protected"
          description="The first questions every compliance lead and CTO asks."
        >
          <ul className="space-y-3">
            {POSTURE.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-success">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div>
                  <p className="text-[13px] font-semibold text-fg">{title}</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-fg-muted">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </SettingSection>
      </div>
    </div>
  );
}
