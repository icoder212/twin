/**
 * Lets the twin's conversation store register how to clear itself, so Settings can offer
 * "Forget conversation memory" without depending on the chat feature's internals.
 */
let forget: (() => void) | null = null;

export function registerConversationForget(fn: () => void): () => void {
  forget = fn;
  return () => {
    if (forget === fn) forget = null;
  };
}

/** Returns true when a registered conversation store was cleared. */
export function forgetConversation(): boolean {
  if (!forget) return false;
  forget();
  return true;
}
