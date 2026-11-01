import {
  BookOpen,
  Ban,
  Copy,
  Route,
  ShieldCheck,
  ShieldOff,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { SPECIALIST_LABELS } from '@twindesk/core';
import { useTenant } from '@/features/tenant/tenant-context';
import { cn } from '@/lib/cn';
import { useApi } from '@/platform/api-context';
import { ComplianceBadge } from '@/shared/components/ComplianceBadge';
import { Button } from '@/shared/ui/button';
import { Spinner } from '@/shared/ui/feedback';
import { Tooltip } from '@/shared/ui/menu';
import { toast } from '@/shared/ui/toast';
import { AnswerBlocks } from './AnswerBlocks';
import { useChatStore, type ChatMessage, type TwinMessage } from './chat-store';
import { RichText } from './RichText';

export function Thread({ onInspect }: { onInspect: () => void }) {
  const messages = useChatStore((s) => s.messages);
  const end = useRef<HTMLDivElement>(null);
  const last = messages.at(-1);
  const lastLength = last?.role === 'twin' ? last.text.length + last.stage.length : 0;

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages.length, lastLength]);

  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6"
      role="log"
      aria-live="polite"
      aria-relevant="additions"
    >
      {messages.map((m) => (
        <MessageView key={m.id} message={m} onInspect={onInspect} />
      ))}
      <div ref={end} />
    </div>
  );
}

function MessageView({ message, onInspect }: { message: ChatMessage; onInspect: () => void }) {
  if (message.role === 'user') {
    return (
      <div className="flex animate-rise flex-col items-end gap-1">
        <div className="max-w-[85%] rounded-2xl rounded-br-md border border-line bg-surface-2 px-4 py-2.5 text-[14.5px] leading-relaxed break-words whitespace-pre-wrap text-fg">
          {message.text}
        </div>
        {message.redactions ? (
          <p className="flex items-center gap-1 text-[11px] text-fg-subtle">
            <ShieldCheck className="size-3 text-success" aria-hidden />
            {message.redactions} personal detail{message.redactions > 1 ? 's' : ''} removed before
            sending
          </p>
        ) : null}
      </div>
    );
  }
  return <TwinView message={message} onInspect={onInspect} />;
}

const STAGE_LABEL = {
  routing: { icon: Route, text: 'Router agent is picking a specialist' },
  researching: { icon: BookOpen, text: 'Searching the knowledge library' },
  checking: { icon: ShieldCheck, text: 'Compliance agent is running eight advice checks' },
} as const;

function TwinView({ message, onInspect }: { message: TwinMessage; onInspect: () => void }) {
  const inspect = useChatStore((s) => s.inspect);
  const inspected = useChatStore((s) => s.inspected?.messageId === message.id);
  const { tenant } = useTenant();
  const api = useApi();
  const [rated, setRated] = useState<'helpful' | 'not-helpful' | null>(null);
  const answer = message.answer;
  const stage =
    message.stage in STAGE_LABEL ? STAGE_LABEL[message.stage as keyof typeof STAGE_LABEL] : null;

  const openCitation = (n: number) => {
    inspect(message.id, n);
    onInspect();
  };

  const rate = (rating: 'helpful' | 'not-helpful') => {
    if (!answer || rated) return;
    setRated(rating);
    api.twin.feedback(answer.id, rating).then(
      () =>
        toast.success('Thanks, that is logged', 'Feedback helps your firm tune the wording rules.'),
      () => setRated(null),
    );
  };

  return (
    <article className="flex animate-rise gap-3" aria-label={`Answer from ${tenant.productName}`}>
      <span
        aria-hidden
        className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full brand-gradient text-on-brand"
      >
        <ShieldCheck className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-fg-subtle">
          <span className="font-semibold text-fg">{tenant.productName}</span>
          {message.specialist ? (
            <span className="rounded-full border border-line px-2 py-px text-[11px]">
              {SPECIALIST_LABELS[message.specialist]} specialist
            </span>
          ) : null}
        </div>

        {answer?.status === 'refused' ? (
          <StatusBanner
            icon={Ban}
            tone="info"
            text="Declined. It asked for a trading decision, which stays with you. Here is what it can do instead."
          />
        ) : answer?.status === 'not-covered' ? (
          <StatusBanner
            icon={BookOpen}
            tone="neutral"
            text="Not covered by its material, so it says so rather than guessing."
          />
        ) : answer?.status === 'withheld' ? (
          <StatusBanner
            icon={ShieldOff}
            tone="danger"
            text="Withheld. The answer failed the advice checks twice and was logged for review."
          />
        ) : null}

        <div className="mt-2">
          {stage && !message.text ? (
            <p className="flex items-center gap-2 py-1 text-[13.5px] text-fg-muted">
              <Spinner />
              <stage.icon className="size-3.5 text-brand-fg" aria-hidden />
              {stage.text}
              {message.stage === 'checking' &&
              message.checkRounds.length > 0 &&
              message.checkRounds.length < 2 &&
              message.checkRounds[0]?.checks.some((c) => !c.passed)
                ? '. A draft was blocked; rewriting'
                : ''}
            </p>
          ) : null}
          {message.text ? (
            <RichText
              text={message.text}
              streaming={message.stage === 'streaming'}
              onCitation={openCitation}
              validCitations={message.citations.map((c) => c.index)}
            />
          ) : null}
          {message.stage === 'error' ? (
            <p role="alert" className="mt-2 flex items-center gap-2 text-[13px] text-danger">
              <TriangleAlert className="size-4" aria-hidden />{' '}
              {message.error ?? 'Something went wrong.'}
            </p>
          ) : null}
          {message.stage === 'stopped' ? (
            <p className="mt-2 text-[12.5px] text-fg-subtle">
              Stopped. Nothing from this answer was saved.
            </p>
          ) : null}
          {answer ? <AnswerBlocks blocks={answer.blocks} onCitation={openCitation} /> : null}
        </div>

        {answer ? (
          <footer className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-3">
            <span className="font-mono text-[11px] text-fg-subtle">
              {answer.citations.length} cited passage{answer.citations.length === 1 ? '' : 's'}
            </span>
            <ComplianceBadge checks={answer.checks} />
            <Tooltip content="Copy the answer id to quote it to compliance or support">
              <button
                type="button"
                onClick={() =>
                  void navigator.clipboard
                    ?.writeText(answer.id)
                    .then(() => toast.success('Answer id copied'))
                    .catch(() => undefined)
                }
                className="inline-flex items-center gap-1 font-mono text-[11px] text-fg-subtle hover:text-fg"
              >
                {answer.id} <Copy className="size-3" aria-hidden />
              </button>
            </Tooltip>
            <span className="font-mono text-[11px] text-fg-subtle">
              {(answer.latencyMs / 1000).toFixed(1)}s
            </span>
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant={inspected ? 'outline' : 'ghost'}
                size="sm"
                onClick={() => {
                  inspect(message.id);
                  onInspect();
                }}
              >
                Inspect
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Helpful"
                aria-pressed={rated === 'helpful'}
                onClick={() => rate('helpful')}
                disabled={!!rated}
              >
                <ThumbsUp className={cn(rated === 'helpful' && 'text-success')} />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Not helpful"
                aria-pressed={rated === 'not-helpful'}
                onClick={() => rate('not-helpful')}
                disabled={!!rated}
              >
                <ThumbsDown className={cn(rated === 'not-helpful' && 'text-danger')} />
              </Button>
            </div>
          </footer>
        ) : null}
      </div>
    </article>
  );
}

function StatusBanner({
  icon: Icon,
  tone,
  text,
}: {
  icon: typeof Ban;
  tone: 'info' | 'neutral' | 'danger';
  text: string;
}) {
  return (
    <p
      className={cn(
        'mt-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-[12.5px]',
        tone === 'info' && 'border-info/30 bg-info/8 text-fg',
        tone === 'neutral' && 'border-line bg-surface-2/60 text-fg-muted',
        tone === 'danger' && 'border-danger/30 bg-danger/8 text-fg',
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 size-3.5 shrink-0',
          tone === 'info' ? 'text-info' : tone === 'danger' ? 'text-danger' : 'text-fg-subtle',
        )}
        aria-hidden
      />
      {text}
    </p>
  );
}
