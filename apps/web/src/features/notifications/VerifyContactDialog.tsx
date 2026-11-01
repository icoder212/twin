import { ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  ApiError,
  CHANNEL_LABELS,
  startVerificationInputSchema,
  userMessage,
  type ContactChannel,
  type VerificationChallenge,
} from '@twindesk/core';
import { env } from '@/app/env';
import { useTenant } from '@/features/tenant/tenant-context';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { Checkbox, Field, Input } from '@/shared/ui/field';
import { useConfirmVerification, useStartVerification } from './queries';

const ADDRESS_FIELD: Record<
  ContactChannel,
  { label: string; placeholder: string; type: string; autoComplete: string; hint: string }
> = {
  email: {
    label: 'Email address',
    placeholder: 'you@firm.com',
    type: 'email',
    autoComplete: 'email',
    hint: 'Usually your work inbox.',
  },
  teams: {
    label: 'Microsoft Teams work account',
    placeholder: 'you@firm.com',
    type: 'email',
    autoComplete: 'email',
    hint: 'The account you use to sign in to Teams. The code arrives as a Teams message.',
  },
  whatsapp: {
    label: 'WhatsApp number',
    placeholder: '+44 7700 900123',
    type: 'tel',
    autoComplete: 'tel',
    hint: 'International format, starting with +.',
  },
  sms: {
    label: 'Mobile number',
    placeholder: '+44 7700 900123',
    type: 'tel',
    autoComplete: 'tel',
    hint: 'International format, starting with +.',
  },
};

/** Two steps: send a code to the address, then confirm it. Nothing else is sent until then. */
export function VerifyContactDialog({
  channel,
  onClose,
}: {
  channel: ContactChannel | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={channel !== null}
      onOpenChange={(open) => !open && onClose()}
      title={channel ? `Add ${CHANNEL_LABELS[channel]}` : 'Add a contact'}
      description="We send a 6-digit code first, so alerts never reach the wrong person."
      size="md"
    >
      {channel ? <VerifyForm key={channel} channel={channel} onDone={onClose} /> : null}
    </Dialog>
  );
}

function VerifyForm({ channel, onDone }: { channel: ContactChannel; onDone: () => void }) {
  const { tenant } = useTenant();
  const start = useStartVerification();
  const confirm = useConfirmVerification();
  const [address, setAddress] = useState('');
  const [consent, setConsent] = useState(false);
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [challenge, setChallenge] = useState<VerificationChallenge | null>(null);
  const field = ADDRESS_FIELD[channel];
  const needsConsent = channel === 'whatsapp' || channel === 'sms';

  const fieldErrorsOf = (error: unknown): Record<string, string> =>
    error instanceof ApiError && error.fieldErrors
      ? error.fieldErrors
      : { form: userMessage(error) };

  const sendCode = (event?: FormEvent) => {
    event?.preventDefault();
    const input = needsConsent ? { channel, address, consent } : { channel, address };
    // Same schema as the server, so mistakes show before anything is sent.
    const parsed = startVerificationInputSchema.safeParse(input);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues)
        next[issue.path.join('.') || 'form'] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    start.mutate(parsed.data, {
      onSuccess: (result) => {
        setChallenge(result);
        setCode('');
      },
      onError: (error) => setErrors(fieldErrorsOf(error)),
    });
  };

  const confirmCode = (event: FormEvent) => {
    event.preventDefault();
    if (!challenge) return;
    setErrors({});
    confirm.mutate(
      { verificationId: challenge.verificationId, code },
      { onSuccess: onDone, onError: (error) => setErrors(fieldErrorsOf(error)) },
    );
  };

  if (challenge) {
    return (
      <form onSubmit={confirmCode} className="space-y-4" noValidate>
        <p className="text-[13px] leading-relaxed text-fg-muted">
          We sent a code to{' '}
          <span className="font-medium text-fg">{challenge.maskedDestination}</span>. It expires in
          10 minutes.
        </p>
        <Field
          label="6-digit code"
          error={errors.code ?? errors.form}
          hint={
            import.meta.env.VITE_API_MODE !== 'http' && env.demoMode ? (
              <>
                Demo code: <span className="font-mono font-semibold text-fg">246810</span>
              </>
            ) : undefined
          }
        >
          {(p) => (
            <Input
              {...p}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              className="font-mono tracking-[0.4em]"
            />
          )}
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => {
              setChallenge(null);
              setErrors({});
            }}
          >
            Change {channel === 'email' || channel === 'teams' ? 'address' : 'number'}
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => sendCode()}
              loading={start.isPending}
            >
              Send again
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={confirm.isPending}
              disabled={code.length !== 6}
            >
              Verify
            </Button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={sendCode} className="space-y-4" noValidate>
      <Field label={field.label} hint={field.hint} error={errors.address}>
        {(p) => (
          <Input
            {...p}
            type={field.type}
            autoComplete={field.autoComplete}
            placeholder={field.placeholder}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        )}
      </Field>
      {needsConsent ? (
        <div>
          <label className="flex items-start gap-2.5 text-[13px] leading-relaxed text-fg-muted">
            <Checkbox
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5"
              aria-invalid={errors.consent ? true : undefined}
            />
            <span>
              I agree to receive {tenant.productName} notifications on this number. I can reply STOP
              at any time. My consent is recorded with the date.
            </span>
          </label>
          {errors.consent ? (
            <p role="alert" className="mt-1 text-xs font-medium text-danger">
              {errors.consent}
            </p>
          ) : null}
        </div>
      ) : null}
      {channel === 'whatsapp' ? (
        <p className="flex gap-2 rounded-xl border border-line bg-surface-2/60 p-3 text-xs leading-relaxed text-fg-muted">
          <ShieldCheck className="mt-px size-3.5 shrink-0 text-brand-fg" aria-hidden />
          WhatsApp is used for notifications only. The number cannot take instructions or questions,
          and every message is archived with your firm’s records.
        </p>
      ) : null}
      {errors.form ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {errors.form}
        </p>
      ) : null}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={start.isPending}>
          Send code
        </Button>
      </div>
    </form>
  );
}
