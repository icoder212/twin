/**
 * Embeds Desk Twin in a host platform.
 *
 * The twin runs in a sandboxed iframe on its own origin, which is the strongest isolation a
 * browser offers: the host page cannot read the twin's DOM, storage or network traffic, and the
 * twin cannot read the host's. The two sides talk only through the typed messages below, and
 * each side checks the other's exact origin before acting on a message.
 */

export const PROTOCOL_VERSION = 1;

export type ColorScheme = 'light' | 'dark';

/** Messages the host sends to the twin. */
export type HostMessage =
  | { type: 'twindesk:init'; version: number; scheme?: ColorScheme }
  | { type: 'twindesk:set-scheme'; scheme: ColorScheme }
  | { type: 'twindesk:ask'; question: string };

/** Messages the twin sends to the host. */
export type TwinMessage =
  | { type: 'twindesk:ready'; version: number }
  | { type: 'twindesk:resize'; height: number }
  | { type: 'twindesk:answer'; answerId: string; status: string }
  | { type: 'twindesk:signed-out' };

const HOST_TYPES = new Set(['twindesk:init', 'twindesk:set-scheme', 'twindesk:ask']);
const TWIN_TYPES = new Set([
  'twindesk:ready',
  'twindesk:resize',
  'twindesk:answer',
  'twindesk:signed-out',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Narrow, allocation-free validation so neither side trusts message shapes blindly. */
export function parseHostMessage(data: unknown): HostMessage | null {
  if (!isRecord(data) || typeof data.type !== 'string' || !HOST_TYPES.has(data.type)) return null;
  const scheme = data.scheme === 'light' || data.scheme === 'dark' ? data.scheme : undefined;
  switch (data.type) {
    case 'twindesk:init':
      return typeof data.version === 'number'
        ? { type: data.type, version: data.version, scheme }
        : null;
    case 'twindesk:set-scheme':
      return scheme ? { type: data.type, scheme } : null;
    case 'twindesk:ask':
      return typeof data.question === 'string' &&
        data.question.length > 0 &&
        data.question.length <= 2000
        ? { type: data.type, question: data.question }
        : null;
    default:
      return null;
  }
}

export function parseTwinMessage(data: unknown): TwinMessage | null {
  if (!isRecord(data) || typeof data.type !== 'string' || !TWIN_TYPES.has(data.type)) return null;
  switch (data.type) {
    case 'twindesk:ready':
      return typeof data.version === 'number' ? { type: data.type, version: data.version } : null;
    case 'twindesk:resize':
      return typeof data.height === 'number' && data.height >= 0 && data.height < 20_000
        ? { type: data.type, height: data.height }
        : null;
    case 'twindesk:answer':
      return typeof data.answerId === 'string' && typeof data.status === 'string'
        ? {
            type: data.type,
            answerId: data.answerId.slice(0, 32),
            status: data.status.slice(0, 20),
          }
        : null;
    case 'twindesk:signed-out':
      return { type: data.type };
    default:
      return null;
  }
}

export interface MountOptions {
  /** Element the iframe is appended to. */
  container: HTMLElement;
  /** Full URL of the twin's embed route, e.g. https://twin.example.com/embed/twin?tenant=meridian */
  src: string;
  scheme?: ColorScheme;
  /** Accessible name of the frame. */
  title?: string;
  /** Grow the iframe to fit its content instead of scrolling inside it. */
  autoHeight?: boolean;
  onMessage?: (message: TwinMessage) => void;
}

export interface TwinDeskHandle {
  setScheme(scheme: ColorScheme): void;
  ask(question: string): void;
  destroy(): void;
}

export function mountTwinDesk(options: MountOptions): TwinDeskHandle {
  const url = new URL(options.src);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new Error('Desk Twin must be embedded over https');
  }
  const twinOrigin = url.origin;

  const frame = document.createElement('iframe');
  frame.src = url.toString();
  frame.title = options.title ?? 'Desk Twin';
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  // Only what the twin needs: scripts, its own origin for its session cookie, forms, and
  // links that open in a new tab. No top navigation, downloads or device access.
  frame.setAttribute(
    'sandbox',
    'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox',
  );
  frame.setAttribute('allow', 'clipboard-write');
  frame.style.border = '0';
  frame.style.width = '100%';
  frame.style.height = '100%';
  frame.style.colorScheme = 'normal';

  const send = (message: HostMessage) => frame.contentWindow?.postMessage(message, twinOrigin);

  const onMessage = (event: MessageEvent) => {
    if (event.origin !== twinOrigin || event.source !== frame.contentWindow) return;
    const message = parseTwinMessage(event.data);
    if (!message) return;
    if (message.type === 'twindesk:ready')
      send({ type: 'twindesk:init', version: PROTOCOL_VERSION, scheme: options.scheme });
    if (message.type === 'twindesk:resize' && options.autoHeight)
      frame.style.height = `${Math.ceil(message.height)}px`;
    options.onMessage?.(message);
  };

  window.addEventListener('message', onMessage);
  options.container.append(frame);

  return {
    setScheme: (scheme) => send({ type: 'twindesk:set-scheme', scheme }),
    ask: (question) => send({ type: 'twindesk:ask', question }),
    destroy() {
      window.removeEventListener('message', onMessage);
      frame.remove();
    },
  };
}
