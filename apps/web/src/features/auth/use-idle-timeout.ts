import { useEffect, useEffectEvent, useRef, useState } from 'react';

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

interface Options {
  timeoutMs: number;
  warningMs: number;
  enabled: boolean;
  onTimeout: () => void;
  /** Called on activity at most once per `heartbeatMs`, to slide the server-side idle window. */
  onHeartbeat?: () => void;
  heartbeatMs?: number;
}

/**
 * Signs the user out after a period without interaction, with a visible countdown first.
 * Financial firms expect this on shared and unattended machines.
 */
export function useIdleTimeout({
  timeoutMs,
  warningMs,
  enabled,
  onTimeout,
  onHeartbeat,
  heartbeatMs = 60_000,
}: Options) {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const lastActivity = useRef(0);
  const lastHeartbeat = useRef(0);

  const timeout = useEffectEvent(() => onTimeout());
  const heartbeat = useEffectEvent(() => onHeartbeat?.());

  useEffect(() => {
    if (!enabled) return;
    lastActivity.current = Date.now();
    const onActivity = () => {
      // Activity during the warning does not cancel it; the user must choose explicitly.
      if (Date.now() - lastActivity.current >= timeoutMs - warningMs) return;
      lastActivity.current = Date.now();
      if (Date.now() - lastHeartbeat.current > heartbeatMs) {
        lastHeartbeat.current = Date.now();
        heartbeat();
      }
    };
    for (const event of ACTIVITY_EVENTS)
      window.addEventListener(event, onActivity, { passive: true, capture: true });
    const tick = window.setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      if (idle >= timeoutMs) {
        setRemainingMs(null);
        timeout();
      } else if (idle >= timeoutMs - warningMs) {
        setRemainingMs(timeoutMs - idle);
      } else {
        setRemainingMs(null);
      }
    }, 1000);
    return () => {
      for (const event of ACTIVITY_EVENTS)
        window.removeEventListener(event, onActivity, { capture: true });
      window.clearInterval(tick);
    };
  }, [enabled, timeoutMs, warningMs, heartbeatMs]);

  const stayActive = () => {
    lastActivity.current = Date.now();
    lastHeartbeat.current = Date.now();
    setRemainingMs(null);
    onHeartbeat?.();
  };

  return { warning: remainingMs !== null, remainingMs: remainingMs ?? 0, stayActive };
}
