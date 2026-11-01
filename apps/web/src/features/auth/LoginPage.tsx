import { useMutation } from '@tanstack/react-query';
import {
  ArrowLeft,
  Building2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation } from 'react-router';
import {
  isApiError,
  loginInputSchema,
  mfaInputSchema,
  ROLE_LABELS,
  DESK_LABELS,
  userMessage,
  type LoginResult,
  type SsoProvider,
} from '@twindesk/core';
import { env } from '@/app/env';
import { useTenant } from '@/features/tenant/tenant-context';
import { zodResolver } from '@/lib/zod-resolver';
import { useApi } from '@/platform/api-context';
import { BrandLogo } from '@/shared/components/BrandLogo';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Field, Input } from '@/shared/ui/field';
import { toast } from '@/shared/ui/toast';
import { HeroPanel } from './HeroPanel';
import { useSessionStore, type EndReason } from './session-store';

const REASONS: Record<EndReason, string> = {
  timeout: 'You were signed out after a period without activity. Sign in again to carry on.',
  expired: 'Your session ended. Please sign in again.',
  'other-tab': 'You signed out in another tab.',
  user: 'You have signed out. Nothing from your session is kept on this device.',
};

const SSO_LABELS: Record<SsoProvider, string> = {
  microsoft: 'Continue with Microsoft',
  google: 'Continue with Google',
  saml: 'Company single sign-on',
};

type Challenge = Extract<LoginResult, { status: 'mfa-required' }>;

export function LoginPage() {
  const { tenant } = useTenant();
  const location = useLocation();
  const reason = (location.state as { reason?: EndReason | null } | null)?.reason ?? null;
  const [challenge, setChallenge] = useState<Challenge | null>(null);

  return (
    <div className="grid min-h-dvh bg-bg lg:grid-cols-[1.1fr_1fr]">
      <HeroPanel />
      <main className="relative flex flex-col px-4 pt-safe pb-6 sm:px-8">
        <div className="flex h-16 items-center lg:hidden">
          <BrandLogo showProduct />
        </div>
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-8">
          <div className="mb-7">
            <p className="font-mono text-[11px] tracking-[0.16em] text-brand-fg uppercase">
              {tenant.productName}
            </p>
            <h1 className="mt-2 text-[28px] font-semibold tracking-tight text-fg">
              {challenge ? 'Check your authenticator' : 'Sign in to your desk'}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              {challenge
                ? `Enter the 6-digit code from ${challenge.maskedDestination}. It changes every 30 seconds.`
                : `Use your work account. For your security, you are signed out after ${tenant.security.idleTimeoutMinutes} minutes without activity.`}
            </p>
          </div>

          {reason && !challenge ? (
            <div
              role="status"
              className="mb-5 flex gap-2.5 rounded-xl border border-info/30 bg-info/10 p-3 text-[13px] text-fg"
            >
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
              {REASONS[reason]}
            </div>
          ) : null}

          {challenge ? (
            <MfaForm challenge={challenge} onBack={() => setChallenge(null)} />
          ) : (
            <PasswordForm onChallenge={setChallenge} />
          )}

          {env.demoMode && !challenge ? <DemoAccounts /> : null}
        </div>

        <footer className="mx-auto w-full max-w-[420px] space-y-3 text-[11.5px] leading-relaxed text-fg-subtle">
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            <span className="inline-flex items-center gap-1.5">
              <Lock className="size-3" aria-hidden /> Encrypted in transit
            </span>
            <span className="inline-flex items-center gap-1.5">
              <KeyRound className="size-3" aria-hidden />{' '}
              {tenant.security.mfaRequired ? 'Two-step sign-in' : 'Single sign-on'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-3" aria-hidden /> Every sign-in logged
            </span>
          </div>
          <p>{tenant.legal.disclaimer}</p>
        </footer>
      </main>
    </div>
  );
}

function PasswordForm({ onChallenge }: { onChallenge: (c: Challenge) => void }) {
  const api = useApi();
  const { tenant } = useTenant();
  const [showPassword, setShowPassword] = useState(false);
  const [lockedFor, setLockedFor] = useState(0);
  const form = useForm({
    resolver: zodResolver(loginInputSchema),
    defaultValues: { email: '', password: '' },
  });
  const { errors } = form.formState;

  const finish = (result: LoginResult) => {
    form.reset({ email: form.getValues('email'), password: '' });
    if (result.status === 'authenticated') useSessionStore.getState().setSession(result.session);
    else onChallenge(result);
  };

  const login = useMutation({
    mutationFn: api.auth.login,
    onSuccess: finish,
    onError: (error) => {
      form.setValue('password', '');
      if (isApiError(error) && error.code === 'locked') setLockedFor(error.retryAfterSeconds ?? 60);
    },
  });
  const sso = useMutation({ mutationFn: api.auth.startSso, onSuccess: finish });

  useEffect(() => {
    if (lockedFor <= 0) return;
    const id = window.setTimeout(() => setLockedFor((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [lockedFor]);

  // Demo accounts fill the form through this event, so the fields stay controlled by the form.
  useEffect(() => {
    const onFill = (event: Event) => {
      const { email, password } = (event as CustomEvent<{ email: string; password: string }>)
        .detail;
      form.setValue('email', email, { shouldValidate: false });
      form.setValue('password', password, { shouldValidate: false });
      form.setFocus('password');
    };
    window.addEventListener('twindesk:demo-fill', onFill);
    return () => window.removeEventListener('twindesk:demo-fill', onFill);
  }, [form]);

  const error = login.error ?? sso.error;
  const busy = login.isPending || sso.isPending;

  return (
    <div className="space-y-5">
      <form
        noValidate
        onSubmit={form.handleSubmit((values) => login.mutate(values))}
        className="space-y-4"
      >
        {error ? (
          <div
            role="alert"
            className="flex gap-2.5 rounded-xl border border-danger/30 bg-danger/10 p-3 text-[13px] text-fg"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
            <span>
              {lockedFor > 0
                ? `Too many attempts. Try again in ${lockedFor} seconds.`
                : userMessage(error)}
            </span>
          </div>
        ) : null}

        <Field label="Work email" error={errors.email?.message}>
          {(props) => (
            <Input
              {...props}
              {...form.register('email')}
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={254}
              placeholder="you@firm.com"
              className="h-11"
            />
          )}
        </Field>

        <Field
          label="Password"
          error={errors.password?.message}
          aside={
            <button
              type="button"
              className="text-xs font-medium text-brand-fg hover:underline"
              onClick={() =>
                toast.info(
                  'Password resets go through your firm',
                  `Contact ${tenant.legal.supportEmail} or your identity provider.`,
                )
              }
            >
              Forgot password?
            </button>
          }
        >
          {(props) => (
            <div className="relative">
              <Input
                {...props}
                {...form.register('password')}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                maxLength={128}
                className="h-11 pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="absolute top-1/2 right-1 grid size-9 -translate-y-1/2 place-items-center rounded-md text-fg-subtle hover:text-fg"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          )}
        </Field>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          loading={login.isPending}
          disabled={busy || lockedFor > 0}
        >
          Sign in
        </Button>
      </form>

      {tenant.security.ssoProviders.length ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-[11px] tracking-[0.14em] text-fg-subtle uppercase">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>
          <div className="grid gap-2">
            {tenant.security.ssoProviders.map((provider) => (
              <Button
                key={provider}
                size="lg"
                className="w-full justify-start"
                onClick={() => sso.mutate(provider)}
                loading={sso.isPending && sso.variables === provider}
                disabled={busy}
              >
                {provider === 'saml' ? <Building2 aria-hidden /> : <KeyRound aria-hidden />}
                {SSO_LABELS[provider]}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MfaForm({ challenge, onBack }: { challenge: Challenge; onBack: () => void }) {
  const api = useApi();
  const form = useForm({
    resolver: zodResolver(mfaInputSchema),
    defaultValues: { challengeId: challenge.challengeId, code: '' },
  });
  const verify = useMutation({
    mutationFn: api.auth.verifyMfa,
    onSuccess: (session) => useSessionStore.getState().setSession(session),
    onError: (error) => {
      form.setValue('code', '');
      if (isApiError(error) && error.fieldErrors?.code)
        form.setError('code', { message: error.fieldErrors.code });
      else if (isApiError(error) && error.code === 'unauthenticated') onBack();
    },
  });

  useEffect(() => form.setFocus('code'), [form]);

  const fieldError = form.formState.errors.code?.message;
  const generalError =
    verify.error && !(isApiError(verify.error) && verify.error.fieldErrors?.code)
      ? userMessage(verify.error)
      : null;

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) => verify.mutate(values))}
      className="space-y-4"
    >
      {generalError ? (
        <div
          role="alert"
          className="flex gap-2.5 rounded-xl border border-danger/30 bg-danger/10 p-3 text-[13px] text-fg"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
          {generalError}
        </div>
      ) : null}
      <Field label="6-digit code" error={fieldError}>
        {(props) => (
          <Input
            {...props}
            {...form.register('code', {
              setValueAs: (v: string) => v.replace(/\D/g, '').slice(0, 6),
            })}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="000000"
            className="h-14 text-center font-mono text-2xl tracking-[0.5em]"
          />
        )}
      </Field>
      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="w-full"
        loading={verify.isPending}
      >
        Verify and continue
      </Button>
      <Button variant="ghost" className="w-full" onClick={onBack}>
        <ArrowLeft aria-hidden /> Use a different account
      </Button>
      {import.meta.env.VITE_API_MODE !== 'http' && env.demoMode ? (
        <p className="rounded-lg border border-dashed border-line-strong px-3 py-2 text-center text-xs text-fg-muted">
          Demo authenticator code: <span className="font-mono font-semibold text-fg">246810</span>
        </p>
      ) : null}
    </form>
  );
}

/** Demo-only helper. The whole block is excluded when demo mode is off. */
function DemoAccounts() {
  const [accounts, setAccounts] = useState<
    ReadonlyArray<{
      email: string;
      name: string;
      role: keyof typeof ROLE_LABELS;
      deskType: keyof typeof DESK_LABELS;
    }>
  >([]);
  const [password, setPassword] = useState('');

  useEffect(() => {
    let cancelled = false;
    // Static guard: builds for the real API contain no demo accounts at all.
    if (import.meta.env.VITE_API_MODE !== 'http') {
      void import('@twindesk/core/mock').then(({ DEMO_USERS, DEMO_PASSWORD }) => {
        if (cancelled) return;
        setAccounts(DEMO_USERS);
        setPassword(DEMO_PASSWORD);
      });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  if (!accounts.length) return null;
  return (
    <section
      aria-labelledby="demo-accounts"
      className="mt-8 rounded-2xl border border-dashed border-line-strong bg-surface/50 p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2
          id="demo-accounts"
          className="flex items-center gap-2 text-[13px] font-semibold text-fg"
        >
          <Sparkles className="size-3.5 text-brand-fg" aria-hidden /> Demo accounts
        </h2>
        <span className="text-[11px] text-fg-subtle">Not in production builds</span>
      </div>
      <ul className="grid gap-1.5">
        {accounts.map((a) => (
          <li key={a.email}>
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent('twindesk:demo-fill', { detail: { email: a.email, password } }),
                )
              }
              className="flex w-full items-center gap-3 rounded-lg border border-transparent px-2.5 py-2 text-left transition-colors hover:border-line hover:bg-surface-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-fg">{a.name}</span>
                <span className="block truncate text-[11.5px] text-fg-subtle">
                  {DESK_LABELS[a.deskType].short}
                </span>
              </span>
              <Badge
                tone={a.role === 'admin' ? 'brand' : a.role === 'compliance' ? 'info' : 'neutral'}
              >
                {ROLE_LABELS[a.role]}
              </Badge>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11.5px] text-fg-subtle">
        Picking an account fills the form. The authenticator code for every demo account is shown on
        the next step.
      </p>
    </section>
  );
}
