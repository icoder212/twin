import { Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useId, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import {
  connectSourceInputSchema,
  isApiError,
  userMessage,
  type ConnectSourceInput,
  type ConnectedSource,
} from '@twindesk/core';
import { zodResolver } from '@/lib/zod-resolver';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { Checkbox, Field, Input } from '@/shared/ui/field';
import { useConnectSource } from './queries';
import { REQUESTED_SCOPES } from './source-meta';

interface FormValues {
  sourceId: string;
  label: string;
  apiKey: string;
  confirmReadOnly: boolean;
}

type ErrorMap = Record<string, { message?: string } | undefined>;

/**
 * The form lives inside the dialog body, which unmounts on close, so a typed key never
 * outlives the dialog in component state.
 */
export function ConnectSourceDialog({
  source,
  onClose,
}: {
  source: ConnectedSource | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={source !== null}
      onOpenChange={(open) => !open && onClose()}
      title={source ? `Connect ${source.name}` : 'Connect'}
      description={source?.description}
      size="md"
    >
      {source ? (
        source.authMethod === 'api-key' ? (
          <ApiKeyForm source={source} onDone={onClose} />
        ) : source.authMethod === 'oauth' ? (
          <OAuthForm source={source} onDone={onClose} />
        ) : (
          <FileUploadNote onDone={onClose} />
        )
      ) : null}
    </Dialog>
  );
}

function SafetyNotes() {
  return (
    <ul className="space-y-2 rounded-xl border border-line bg-surface-2/60 p-3 text-xs leading-relaxed text-fg-muted">
      <li className="flex gap-2">
        <LockKeyhole className="mt-px size-3.5 shrink-0 text-brand-fg" aria-hidden />
        Keys sit in a managed vault, never in a prompt. After you connect, the key is not shown
        again.
      </li>
      <li className="flex gap-2">
        <ShieldCheck className="mt-px size-3.5 shrink-0 text-success" aria-hidden />
        Use a read-only key. Never a key that can place orders or move money.
      </li>
    </ul>
  );
}

function ApiKeyForm({ source, onDone }: { source: ConnectedSource; onDone: () => void }) {
  const connect = useConnectSource();
  const [showKey, setShowKey] = useState(false);
  const confirmId = useId();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<FormValues, unknown, ConnectSourceInput>({
    defaultValues: { sourceId: source.id, label: source.name, apiKey: '', confirmReadOnly: false },
    resolver: zodResolver(connectSourceInputSchema) as unknown as Resolver<
      FormValues,
      unknown,
      ConnectSourceInput
    >,
  });
  const errorFor = (name: string) => (errors as ErrorMap)[name]?.message;

  const onSubmit = handleSubmit((values) => {
    if (!values.apiKey) {
      setError('apiKey', { message: 'Add the read-only API key' });
      return;
    }
    connect.mutate(values, {
      onSuccess: () => {
        // Clear the key from form state before the dialog closes.
        reset({ sourceId: source.id, label: '', apiKey: '', confirmReadOnly: false });
        onDone();
      },
      onError: (error) => {
        if (isApiError(error) && error.fieldErrors) {
          for (const [field, message] of Object.entries(error.fieldErrors))
            setError(field as keyof FormValues, { message });
        } else {
          setError('root', { message: userMessage(error) });
        }
      },
    });
  });

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-4">
      <input type="hidden" {...register('sourceId')} />
      <Field
        label="Connection name"
        hint="Shown in your sources and the audit log"
        error={errorFor('label')}
      >
        {(p) => <Input {...p} {...register('label')} maxLength={60} autoComplete="off" />}
      </Field>
      <Field label="Read-only API key" error={errorFor('apiKey')}>
        {(p) => (
          <div className="relative">
            <Input
              {...p}
              {...register('apiKey')}
              type={showKey ? 'text' : 'password'}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={512}
              placeholder="Paste the key from your provider"
              className="pr-11 font-mono"
            />
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute inset-y-0 right-1 my-auto"
              aria-label={showKey ? 'Hide key' : 'Show key'}
              aria-pressed={showKey}
              onClick={() => setShowKey((v) => !v)}
            >
              {showKey ? <EyeOff /> : <Eye />}
            </Button>
          </div>
        )}
      </Field>
      <SafetyNotes />
      <div>
        <div className="flex min-h-10 items-start gap-3">
          <Checkbox
            id={confirmId}
            {...register('confirmReadOnly')}
            className="mt-0.5"
            aria-invalid={errorFor('confirmReadOnly') ? true : undefined}
          />
          <label htmlFor={confirmId} className="cursor-pointer text-[13px] text-fg">
            I confirm this key is read-only and cannot place orders or move money.
          </label>
        </div>
        {errorFor('confirmReadOnly') ? (
          <p role="alert" className="mt-1 text-xs font-medium text-danger">
            {errorFor('confirmReadOnly')}
          </p>
        ) : null}
      </div>
      {errors.root?.message ? (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger"
        >
          {errors.root.message}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={connect.isPending}>
          <KeyRound aria-hidden /> Connect read-only
        </Button>
      </div>
    </form>
  );
}

function OAuthForm({ source, onDone }: { source: ConnectedSource; onDone: () => void }) {
  const connect = useConnectSource();
  const [error, setError] = useState<string>();
  const scopes = source.scopes.length
    ? source.scopes
    : (REQUESTED_SCOPES[source.provider] ?? ['Only the access your tasks need']);

  const start = () => {
    const parsed = connectSourceInputSchema.safeParse({
      sourceId: source.id,
      label: source.name,
      confirmReadOnly: true,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    connect.mutate(parsed.data, { onSuccess: onDone, onError: (e) => setError(userMessage(e)) });
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] leading-relaxed text-fg-muted">
        You’ll sign in with {source.name} itself. We never see your password, and you can revoke
        access from your {source.name} account at any time.
      </p>
      <div className="rounded-xl border border-line p-3">
        <p className="text-[13px] font-semibold text-fg">Access requested</p>
        <ul className="mt-2 space-y-1.5">
          {scopes.map((s) => (
            <li key={s} className="flex items-start gap-2 text-[13px] text-fg-muted">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
              {s}
            </li>
          ))}
        </ul>
      </div>
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger"
        >
          {error}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button variant="primary" loading={connect.isPending} onClick={start}>
          Continue with {source.name}
        </Button>
      </div>
    </div>
  );
}

function FileUploadNote({ onDone }: { onDone: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] leading-relaxed text-fg-muted">
        Documents are added through the document importer, which checks each file before it joins
        the twin’s knowledge. Each document keeps its source, date and owner, so answers can cite
        it.
      </p>
      <div className="flex justify-end border-t border-line pt-4">
        <Button onClick={onDone}>Close</Button>
      </div>
    </div>
  );
}
