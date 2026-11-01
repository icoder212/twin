import type { TwinMessage } from '@twindesk/embed-sdk';

let hostOrigin: string | null = null;

/** Set once the host has passed the origin check; until then nothing is ever posted. */
export function setVerifiedHostOrigin(origin: string | null): void {
  hostOrigin = origin;
}

/** Posts to the parent window, only to the exact origin that was verified. */
export function notifyHost(message: TwinMessage): void {
  if (!hostOrigin || window.parent === window) return;
  window.parent.postMessage(message, hostOrigin);
}
