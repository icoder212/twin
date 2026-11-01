import { create } from 'zustand';
import {
  createId,
  type Citation,
  type ComplianceCheckResult,
  type Specialist,
  type TwinAnswer,
} from '@twindesk/core';
import { registerSessionReset } from '@/features/auth/session-store';
import { registerConversationForget } from '@/features/settings/forget-conversation';

export type TwinStage =
  'routing' | 'researching' | 'checking' | 'streaming' | 'done' | 'stopped' | 'error';

export interface UserMessage {
  id: string;
  role: 'user';
  text: string;
  createdAt: string;
  /** Personal details removed before sending, shown so the user knows what left the device. */
  redactions: number;
}

export interface TwinMessage {
  id: string;
  role: 'twin';
  createdAt: string;
  stage: TwinStage;
  text: string;
  specialist?: Specialist;
  routeReason?: string;
  citations: Citation[];
  library?: { matched: number; size: number };
  /** One entry per draft checked. A blocked draft appears here, never its text. */
  checkRounds: Array<{ attempt: number; checks: ComplianceCheckResult[] }>;
  answer?: TwinAnswer;
  error?: string;
}

export type ChatMessage = UserMessage | TwinMessage;

interface ChatState {
  conversationId: string;
  messages: ChatMessage[];
  /** Answer shown in the inspector, and an optional citation to highlight there. */
  inspected: { messageId: string; citation?: number } | null;
  pending: boolean;
  addUser: (text: string, redactions: number) => void;
  addTwin: () => string;
  patchTwin: (
    id: string,
    patch: Partial<TwinMessage> | ((m: TwinMessage) => Partial<TwinMessage>),
  ) => void;
  inspect: (messageId: string, citation?: number) => void;
  closeInspector: () => void;
  setPending: (pending: boolean) => void;
  reset: () => void;
}

const initial = () => ({
  conversationId: createId('conv'),
  messages: [] as ChatMessage[],
  inspected: null,
  pending: false,
});

/**
 * The conversation lives in memory only. It is never written to Web Storage, and it is wiped
 * on sign-out so the next person on the device cannot scroll back through it.
 */
export const useChatStore = create<ChatState>()((set) => ({
  ...initial(),
  addUser: (text, redactions) =>
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id: createId('msg'),
          role: 'user',
          text,
          redactions,
          createdAt: new Date().toISOString(),
        },
      ],
    })),
  addTwin: () => {
    const id = createId('msg');
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id,
          role: 'twin',
          createdAt: new Date().toISOString(),
          stage: 'routing',
          text: '',
          citations: [],
          checkRounds: [],
        },
      ],
    }));
    return id;
  },
  patchTwin: (id, patch) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id && m.role === 'twin'
          ? { ...m, ...(typeof patch === 'function' ? patch(m) : patch) }
          : m,
      ),
    })),
  inspect: (messageId, citation) => set({ inspected: { messageId, citation } }),
  closeInspector: () => set({ inspected: null }),
  setPending: (pending) => set({ pending }),
  reset: () => set(initial()),
}));

registerSessionReset(() => useChatStore.getState().reset());
registerConversationForget(() => useChatStore.getState().reset());
