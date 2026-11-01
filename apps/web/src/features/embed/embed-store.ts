import { create } from 'zustand';

/**
 * Questions a verified host page asks through the embed bridge. The embedded twin page takes
 * them one at a time and sends them as if the user had typed them.
 */
export const useEmbedStore = create<{
  pendingQuestion: string | null;
  ask: (question: string) => void;
  take: () => string | null;
}>()((set, get) => ({
  pendingQuestion: null,
  ask: (question) => set({ pendingQuestion: question }),
  take: () => {
    const question = get().pendingQuestion;
    set({ pendingQuestion: null });
    return question;
  },
}));
