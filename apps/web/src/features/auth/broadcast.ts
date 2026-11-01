const CHANNEL = 'twindesk-auth';

/** Signing out in one tab signs out every tab of the app on this device. */
export function broadcastSignOut(): void {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ type: 'signed-out' });
    channel.close();
  } catch {
    // BroadcastChannel is unavailable in some embedded contexts.
  }
}

export function onSignOutElsewhere(callback: () => void): () => void {
  let channel: BroadcastChannel;
  try {
    channel = new BroadcastChannel(CHANNEL);
  } catch {
    return () => undefined;
  }
  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (
      typeof event.data === 'object' &&
      event.data !== null &&
      (event.data as { type?: unknown }).type === 'signed-out'
    ) {
      callback();
    }
  };
  return () => channel.close();
}
