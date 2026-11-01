import { PanelRight, RotateCcw, ScanSearch } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { DESK_LABELS, sanitizeText } from '@twindesk/core';
import { useAuth } from '@/features/auth/use-auth';
import { useEmbedStore } from '@/features/embed/embed-store';
import { useTenant } from '@/features/tenant/tenant-context';
import { cn } from '@/lib/cn';
import { useMediaQuery } from '@/shared/hooks/use-media-query';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { Tooltip } from '@/shared/ui/menu';
import { useChatStore } from './chat-store';
import { Composer } from './Composer';
import { Inspector } from './Inspector';
import { Thread } from './Thread';
import { useAsk } from './use-ask';
import { Welcome } from './Welcome';

/**
 * Runs a prompt handed over by another screen (a routine card, the command palette, a shortcut)
 * once. Prompts travel in router state, never in the URL, so a crafted link cannot make the
 * twin act on someone's behalf.
 */
function useHandOff(onPrompt: (prompt: string, autoSend: boolean) => void) {
  const location = useLocation();
  const navigate = useNavigate();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    const state = location.state as { prompt?: unknown; autoSend?: unknown } | null;
    if (handled.current === location.key || typeof state?.prompt !== 'string') return;
    handled.current = location.key;
    void navigate(location.pathname, { replace: true, state: null });
    onPrompt(state.prompt, state.autoSend === true);
  }, [location, navigate, onPrompt]);
}

function InspectorHeader({ onClose }: { onClose?: () => void }) {
  const { user } = useAuth();
  return (
    <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3.5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
        <ScanSearch className="size-4 text-brand-fg" aria-hidden /> Inspector
      </h2>
      <div className="flex items-center gap-2">
        {user ? <Badge tone="info">{DESK_LABELS[user.deskType].short}</Badge> : null}
        {onClose ? (
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function TwinWorkspace({ embedded = false }: { embedded?: boolean }) {
  const { ask, stop } = useAsk();
  const hasMessages = useChatStore((s) => s.messages.length > 0);
  const pending = useChatStore((s) => s.pending);
  const reset = useChatStore((s) => s.reset);
  const wide = useMediaQuery('(min-width: 1280px)') && !embedded;
  const [sheetOpen, setSheetOpen] = useState(false);
  const { tenant } = useTenant();
  // A prompt with placeholder arguments (e.g. "/note ") lands in the composer instead of sending.
  const [prefill, setPrefill] = useState<{ text: string; key: number } | null>(null);
  const onPrompt = useCallback(
    (prompt: string, autoSend: boolean) => {
      if (autoSend) void ask(prompt);
      else setPrefill({ text: sanitizeText(prompt, { maxLength: 2000 }), key: Date.now() });
    },
    [ask],
  );
  useHandOff(onPrompt);

  // Questions a verified host page sends through the embed bridge.
  const pendingQuestion = useEmbedStore((s) => s.pendingQuestion);
  useEffect(() => {
    if (!embedded || !pendingQuestion || pending) return;
    const question = useEmbedStore.getState().take();
    if (question) void ask(question);
  }, [embedded, pendingQuestion, pending, ask]);

  const openInspector = () => {
    if (!wide) setSheetOpen(true);
  };

  return (
    <div
      className={cn(
        'flex',
        embedded
          ? 'h-full'
          : '-mb-24 h-[calc(100dvh-7rem-env(safe-area-inset-bottom))] lg:-mb-12 lg:h-[calc(100dvh-4rem)]',
      )}
    >
      <section aria-label="Conversation" className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5 sm:px-6">
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold text-fg">
              {embedded ? tenant.productName : 'Ask the twin'}
            </h1>
            <p className="hidden truncate text-[12px] text-fg-subtle sm:block">
              Router, research and compliance agents on every answer
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {hasMessages ? (
              <Tooltip content="Start a new conversation. This one is not kept on the device.">
                <Button variant="ghost" size="sm" onClick={reset} disabled={pending}>
                  <RotateCcw aria-hidden /> New
                </Button>
              </Tooltip>
            ) : null}
            {!wide ? (
              <Button variant="secondary" size="sm" onClick={() => setSheetOpen(true)}>
                <PanelRight aria-hidden /> Inspector
              </Button>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {hasMessages ? (
            <Thread onInspect={openInspector} />
          ) : (
            <Welcome onAsk={(p) => void ask(p)} compact={embedded} />
          )}
        </div>

        <div className="border-t border-line bg-bg/80 px-4 pt-3 pb-3 backdrop-blur sm:px-6">
          <div className="mx-auto w-full max-w-3xl">
            <Composer
              key={prefill?.key}
              initialValue={prefill?.text}
              onSend={(text) => void ask(text)}
              onStop={stop}
              pending={pending}
              compact={embedded}
            />
          </div>
        </div>
      </section>

      {wide ? (
        <aside
          aria-label="Answer inspector"
          className="w-[400px] shrink-0 overflow-y-auto border-l border-line bg-surface/40"
        >
          <InspectorHeader />
          <Inspector />
        </aside>
      ) : (
        <Dialog
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title="Inspector"
          variant="sheet-right"
          bare
        >
          <div className="flex h-full flex-col">
            <InspectorHeader onClose={() => setSheetOpen(false)} />
            <div className="min-h-0 flex-1 overflow-y-auto pb-safe">
              <Inspector />
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

export function TwinPage() {
  return <TwinWorkspace />;
}

/** The same twin, chromeless, for host platforms that embed it in an iframe. */
export function EmbeddedTwinPage() {
  return <TwinWorkspace embedded />;
}
