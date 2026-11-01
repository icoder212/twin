import { create } from 'zustand';
import type { Session } from '@twindesk/core';

export type SessionStatus = 'loading' | 'authenticated' | 'anonymous';
export type EndReason = 'user' | 'timeout' | 'expired' | 'other-tab';

interface SessionState {
  status: SessionStatus;
  session: Session | null;
  endReason: EndReason | null;
  setSession: (session: Session) => void;
  end: (reason: EndReason | null) => void;
}

/**
 * The signed-in user, in memory only. Nothing about the session is written to Web Storage by
 * the app; the real backend keeps it in an HttpOnly cookie the page cannot read.
 */
export const useSessionStore = create<SessionState>()((set) => ({
  status: 'loading',
  session: null,
  endReason: null,
  setSession: (session) => set({ status: 'authenticated', session, endReason: null }),
  end: (endReason) => set({ status: 'anonymous', session: null, endReason }),
}));

/** Stores holding per-user data register here and are wiped on every sign-out. */
const resets = new Set<() => void>();

export function registerSessionReset(reset: () => void): void {
  resets.add(reset);
}

export function runSessionResets(): void {
  for (const reset of resets) reset();
}
