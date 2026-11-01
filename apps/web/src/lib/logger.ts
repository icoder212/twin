/**
 * The only place the app writes to the console. Production builds stay silent so nothing
 * sensitive ends up in a shared machine's devtools; wire `report` to the monitoring service
 * (with PII scrubbing) when one is chosen.
 */
const enabled = import.meta.env.DEV;

export const logger = {
  debug: (...args: unknown[]) => {
    if (enabled) console.debug('[twindesk]', ...args);
  },
  warn: (...args: unknown[]) => {
    if (enabled) console.warn('[twindesk]', ...args);
  },
  error: (message: string, error?: unknown) => {
    if (enabled) console.error('[twindesk]', message, error);
  },
};
