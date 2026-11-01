import { useEffect, useEffectEvent, type RefObject } from 'react';
import {
  parseHostMessage,
  PROTOCOL_VERSION,
  type HostMessage,
  type TwinMessage,
} from '@twindesk/embed-sdk';
import { isAllowedOrigin, sanitizeText } from '@twindesk/core';
import { useSessionStore } from '@/features/auth/session-store';
import { useTenant } from '@/features/tenant/tenant-context';
import { notifyHost, setVerifiedHostOrigin } from './bridge';
import { useEmbedStore } from './embed-store';

function originOf(url: string): string | null {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
}

const isFramed = () => window.parent !== window;

/**
 * Connects the embedded twin to its host page. Messages are accepted only from the parent
 * window, only from an origin the tenant allows (or this app's own origin for the preview),
 * and only when they parse as a known message type. Nothing is posted until the host is known.
 */
export function EmbedBridge({ contentRef }: { contentRef: RefObject<HTMLElement | null> }) {
  const { tenant, forceScheme } = useTenant();

  const isTrusted = useEffectEvent(
    (origin: string) =>
      origin === window.location.origin || isAllowedOrigin(origin, tenant.embed.allowedOrigins),
  );

  const handle = useEffectEvent((message: HostMessage) => {
    switch (message.type) {
      case 'twindesk:init':
        if (message.scheme) forceScheme(message.scheme);
        break;
      case 'twindesk:set-scheme':
        forceScheme(message.scheme);
        break;
      case 'twindesk:ask': {
        const question = sanitizeText(message.question, { maxLength: 2000 });
        if (question) useEmbedStore.getState().ask(question);
        break;
      }
    }
  });

  // Inbound messages and the ready handshake.
  useEffect(() => {
    if (!isFramed()) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || !isTrusted(event.origin)) return;
      const message = parseHostMessage(event.data);
      if (!message) return;
      setVerifiedHostOrigin(event.origin);
      handle(message);
    };
    window.addEventListener('message', onMessage);

    // The host is unverified until it sends a valid message, so the only safe target for
    // "ready" is the referrer's origin, and only when that origin is on the allow-list.
    const referrer = originOf(document.referrer);
    if (referrer && isTrusted(referrer)) {
      const ready: TwinMessage = { type: 'twindesk:ready', version: PROTOCOL_VERSION };
      window.parent.postMessage(ready, referrer);
    }

    return () => {
      window.removeEventListener('message', onMessage);
      setVerifiedHostOrigin(null);
      forceScheme(null);
    };
  }, [forceScheme]);

  // Report content height so hosts can size the frame.
  useEffect(() => {
    const element = contentRef.current;
    if (!element || !isFramed() || typeof ResizeObserver === 'undefined') return;
    let last = 0;
    const observer = new ResizeObserver(() => {
      const height = Math.ceil(element.scrollHeight);
      if (height !== last) {
        last = height;
        notifyHost({ type: 'twindesk:resize', height });
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [contentRef]);

  // Tell the host when the session ends. Subscribing to the store fires before the route guard
  // unmounts this component.
  useEffect(
    () =>
      useSessionStore.subscribe((state, previous) => {
        if (previous.status === 'authenticated' && state.status === 'anonymous')
          notifyHost({ type: 'twindesk:signed-out' });
      }),
    [],
  );

  return null;
}
