import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { detectPii, redactPii, sanitizeText, userMessage } from '@twindesk/core';
import { qk } from '@/app/query-keys';
import { notifyHost } from '@/features/embed/bridge';
import { useApi } from '@/platform/api-context';
import { useChatStore } from './chat-store';

/** Sends a question and folds the streamed agent events into the conversation. */
export function useAsk() {
  const api = useApi();
  const queryClient = useQueryClient();
  const controller = useRef<AbortController | null>(null);

  const ask = useCallback(
    async (raw: string) => {
      const store = useChatStore.getState();
      if (store.pending) return;
      const clean = sanitizeText(raw, { maxLength: 2000 });
      if (!clean) return;
      // Personal and account details never leave the device, even if the user sends anyway.
      const matches = detectPii(clean);
      const question = matches.length ? redactPii(clean, matches) : clean;

      store.addUser(question, matches.length);
      const id = store.addTwin();
      store.setPending(true);
      store.inspect(id);
      const abort = new AbortController();
      controller.current = abort;

      try {
        for await (const event of api.twin.ask(
          { conversationId: store.conversationId, question },
          abort.signal,
        )) {
          const { patchTwin } = useChatStore.getState();
          switch (event.type) {
            case 'routed':
              patchTwin(id, {
                stage: 'researching',
                specialist: event.specialist,
                routeReason: event.reason,
              });
              break;
            case 'retrieved':
              patchTwin(id, {
                stage: 'checking',
                citations: event.citations,
                library: { matched: event.matched, size: event.size },
              });
              break;
            case 'checked':
              patchTwin(id, (m) => ({
                checkRounds: [...m.checkRounds, { attempt: event.attempt, checks: event.checks }],
              }));
              break;
            case 'delta':
              patchTwin(id, (m) => ({ stage: 'streaming', text: m.text + event.text }));
              break;
            case 'done':
              patchTwin(id, {
                stage: 'done',
                answer: event.answer,
                text: event.answer.text,
                citations: event.answer.citations,
              });
              notifyHost({
                type: 'twindesk:answer',
                answerId: event.answer.id,
                status: event.answer.status,
              });
              break;
            case 'error':
              patchTwin(id, { stage: 'error', error: event.message });
              break;
          }
        }
        // Shortcuts can create alerts, approvals and notes; refresh anything they may have touched.
        for (const key of [qk.approvals, qk.alerts, qk.notifications, qk.overview, qk.auditRoot]) {
          void queryClient.invalidateQueries({ queryKey: key });
        }
      } catch (error) {
        const { patchTwin } = useChatStore.getState();
        if (abort.signal.aborted) patchTwin(id, { stage: 'stopped' });
        else patchTwin(id, { stage: 'error', error: userMessage(error) });
      } finally {
        controller.current = null;
        useChatStore.getState().setPending(false);
      }
    },
    [api, queryClient],
  );

  const stop = useCallback(() => controller.current?.abort(), []);

  return { ask, stop };
}
