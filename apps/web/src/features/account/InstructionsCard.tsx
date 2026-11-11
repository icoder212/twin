import { Sparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  CENTRAL_BANKS,
  MAJOR_US_RELEASES,
  type EconomicState,
  type EconomicWatch,
  type EconomicWatchUpdate,
  type InstructionReply,
  type NewsState,
  type NewsWatch,
  type NewsWatchUpdate,
  type WatchKind,
} from '@twindesk/core';
import { toastError } from '@/lib/mutation';
import { QueryView } from '@/shared/components/QueryView';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/feedback';
import { Field, Textarea } from '@/shared/ui/field';
import { toast } from '@/shared/ui/toast';
import { useRealAccount } from './real-account';
import { Following, NewsFields, ReleasesFields, Watching } from './watch-sections';
import { listWords, newsProblem, releasesProblem } from './watch-text';
import {
  useEconomic,
  useInstruction,
  useNews,
  useSaveNews,
  useSaveWatch,
  useStopNews,
  useStopWatch,
} from './watch-queries';

const EXAMPLES = [
  'Send me a summary at 18:00 of tomorrow’s major US releases, a reminder 30 minutes before each on WhatsApp, and the figures afterwards',
  'Alert me on Nvidia and Apple headlines, anything on tariffs, and Fed and Bank of England decisions',
  'Send news alerts to WhatsApp as well',
];

/** Where "choose yourself" starts when nothing is set up yet. */
const RELEASES_STARTER: EconomicWatch = {
  events: MAJOR_US_RELEASES,
  remindMinutes: 15,
  results: true,
};
const NEWS_STARTER: NewsWatch = { tickers: [], topics: [], centralBanks: [...CENTRAL_BANKS] };

const KIND_WORDS: Record<WatchKind, string> = {
  economic: 'US economic release alerts',
  news: 'news alerts',
};

/** Changes waiting for the owner's confirmation. */
interface Draft {
  economic?: EconomicWatchUpdate;
  news?: NewsWatchUpdate;
  stop?: WatchKind[];
}

function draftFrom(reply: InstructionReply): Draft | null {
  if (reply.kind === 'reply') return null;
  if (reply.kind === 'stop') return { stop: reply.what };
  return {
    ...(reply.watch
      ? {
          economic: { watch: reply.watch, ...(reply.channels ? { channels: reply.channels } : {}) },
        }
      : {}),
    ...(reply.news
      ? {
          news: {
            watch: reply.news,
            ...(reply.newsChannels ? { channels: reply.newsChannels } : {}),
          },
        }
      : {}),
    ...(reply.stop ? { stop: reply.stop } : {}),
  };
}

/**
 * On the Notifications page, with the real account: instructions in the owner's own words.
 * Claude proposes the settings and the owner confirms. The server then sends a reminder before
 * each US release and the figures as published, and the news the owner follows.
 */
export function InstructionsCard() {
  const signedIn = useRealAccount((s) => s.status.signedIn);
  const economic = useEconomic();
  const news = useNews();
  if (!signedIn) return null;
  return (
    <Card aria-labelledby="instructions-title">
      <CardHeader>
        <div>
          <CardTitle id="instructions-title" className="flex items-center gap-2">
            <Sparkles className="size-4 text-brand-fg" aria-hidden /> Instructions for Desk Twin
          </CardTitle>
          <CardDescription>
            Tell Desk Twin what to watch, in your own words: US economic releases, and news on
            companies, topics and central banks. Claude reads the instruction and shows what it
            understood. Nothing changes until you confirm.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <QueryView query={economic} loading={<Skeleton className="h-40 rounded-xl" />}>
          {(economicState) => (
            <QueryView query={news} loading={<Skeleton className="h-40 rounded-xl" />}>
              {(newsState) => <Instructions economic={economicState} news={newsState} />}
            </QueryView>
          )}
        </QueryView>
      </CardContent>
    </Card>
  );
}

function Instructions({ economic, news }: { economic: EconomicState; news: NewsState }) {
  const [text, setText] = useState('');
  const [answer, setAnswer] = useState<InstructionReply | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const instruction = useInstruction();
  const saveReleases = useSaveWatch();
  const stopReleases = useStopWatch();
  const saveNews = useSaveNews();
  const stopNews = useStopNews();
  const claude = economic.claude;

  const send = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length < 3) return;
    instruction.mutate(trimmed, {
      onSuccess: (reply) => {
        setAnswer(reply);
        setDraft(draftFrom(reply));
      },
      onError: toastError('Desk Twin could not read that'),
    });
  };

  const reset = () => {
    setAnswer(null);
    setDraft(null);
  };

  const apply = async (changes: Draft) => {
    setSaving(true);
    try {
      if (changes.economic) await saveReleases.mutateAsync(changes.economic);
      if (changes.news) await saveNews.mutateAsync(changes.news);
      if (changes.stop?.includes('economic')) await stopReleases.mutateAsync();
      if (changes.stop?.includes('news')) await stopNews.mutateAsync();
      reset();
      setText('');
      const saved = changes.economic || changes.news;
      toast.success(
        saved ? 'Saved' : 'Stopped',
        saved
          ? 'Alerts go to the channels shown.'
          : `No more ${listWords((changes.stop ?? []).map((k) => KIND_WORDS[k]))} will be sent.`,
      );
    } catch (error) {
      toastError('That could not be saved')(error);
    } finally {
      setSaving(false);
    }
  };

  const edit = (changes: Draft) => {
    setAnswer(null);
    setDraft(changes);
  };

  const problem =
    (draft?.economic && releasesProblem(draft.economic.watch)) ||
    (draft?.news && newsProblem(draft.news.watch));
  const onlyStops = draft && !draft.economic && !draft.news;

  return (
    <div className="space-y-5">
      <form onSubmit={send} className="space-y-3">
        <Field
          label="Your instruction"
          hint={
            claude
              ? undefined
              : 'Claude is not set up on the server yet, so choose the settings yourself for now.'
          }
        >
          {(props) => (
            <Textarea
              {...props}
              value={text}
              maxLength={600}
              disabled={!claude}
              placeholder={EXAMPLES[0]}
              onChange={(e) => setText(e.target.value)}
            />
          )}
        </Field>
        {claude ? (
          <div className="flex flex-wrap gap-1.5" aria-label="Examples">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setText(example)}
                className="rounded-full border border-line px-2.5 py-1 text-left text-xs text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
              >
                {example}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            size="sm"
            variant="primary"
            loading={instruction.isPending}
            disabled={!claude || text.trim().length < 3}
          >
            <Sparkles aria-hidden /> Send to Claude
          </Button>
          {draft ? null : (
            <>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => edit({ economic: { watch: economic.watch ?? RELEASES_STARTER } })}
              >
                Choose releases yourself
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => edit({ news: { watch: news.watch ?? NEWS_STARTER } })}
              >
                Choose news yourself
              </Button>
            </>
          )}
        </div>
      </form>

      {answer ? (
        <p
          role="status"
          className="flex gap-2.5 rounded-lg border border-line bg-surface-2/60 p-3 text-[13px] leading-relaxed text-fg"
        >
          <Sparkles className="mt-0.5 size-4 shrink-0 text-brand-fg" aria-hidden />
          <span>{answer.message}</span>
        </p>
      ) : null}

      {draft ? (
        <section
          aria-label="Check before saving"
          className="space-y-5 rounded-xl border border-line bg-surface-2/40 p-4"
        >
          {draft.economic ? (
            <ReleasesFields
              value={draft.economic}
              onChange={(next) => setDraft({ ...draft, economic: next })}
            />
          ) : null}
          {draft.news ? (
            <NewsFields
              value={draft.news}
              onChange={(next) => setDraft({ ...draft, news: next })}
            />
          ) : null}
          {draft.stop?.length ? (
            <p className="text-[13px] text-fg-muted">
              This also stops {listWords(draft.stop.map((k) => KIND_WORDS[k]))}.
            </p>
          ) : null}
          {problem ? (
            <p role="alert" className="text-xs font-medium text-danger">
              {problem}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="primary"
              loading={saving}
              disabled={Boolean(problem)}
              onClick={() => void apply(draft)}
            >
              {onlyStops ? 'Stop' : 'Confirm'}
            </Button>
            <Button size="sm" variant="ghost" onClick={reset}>
              {onlyStops ? 'Keep them' : 'Cancel'}
            </Button>
          </div>
        </section>
      ) : null}

      {economic.watch && !draft?.economic ? (
        <Watching
          state={economic}
          watch={economic.watch}
          onChange={() => edit({ economic: { watch: economic.watch ?? RELEASES_STARTER } })}
          onStop={() => void apply({ stop: ['economic'] })}
          stopping={stopReleases.isPending}
        />
      ) : null}
      {news.watch && !draft?.news ? (
        <Following
          state={news}
          watch={news.watch}
          onChange={() => edit({ news: { watch: news.watch ?? NEWS_STARTER } })}
          onStop={() => void apply({ stop: ['news'] })}
          stopping={stopNews.isPending}
        />
      ) : null}
      {!economic.watch && !news.watch && !draft ? (
        <p className="text-[13px] text-fg-subtle">Nothing is being watched yet.</p>
      ) : null}
    </div>
  );
}
