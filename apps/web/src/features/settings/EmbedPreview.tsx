import { AppWindow, Moon, Send, Sun } from 'lucide-react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  parseTwinMessage,
  PROTOCOL_VERSION,
  type ColorScheme,
  type HostMessage,
  type TwinMessage,
} from '@twindesk/embed-sdk';
import { useTenant } from '@/features/tenant/tenant-context';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { SettingSection } from './SettingSection';

const SNIPPET = `import { mountTwinDesk } from '@twindesk/embed-sdk';

const twin = mountTwinDesk({
  container: document.getElementById('desk-twin'),
  src: 'https://twin.your-firm.com/embed/twin',
  scheme: 'light',
  autoHeight: false,
  onMessage: (message) => {
    if (message.type === 'twindesk:answer') audit(message.answerId);
  },
});

twin.ask('How close am I to my daily limit?');`;

function describe(message: TwinMessage): string {
  switch (message.type) {
    case 'twindesk:ready':
      return `ready · protocol v${message.version}`;
    case 'twindesk:answer':
      return `answer ${message.answerId} · ${message.status}`;
    case 'twindesk:signed-out':
      return 'signed out';
    case 'twindesk:resize':
      return `resize · ${message.height}px`;
  }
}

/**
 * The twin inside a mock host platform, driven through the same postMessage protocol the embed
 * SDK uses. Same-origin here; in production the twin runs on its own origin.
 */
export function EmbedPreview() {
  const { tenant, scheme } = useTenant();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [hostScheme, setHostScheme] = useState<ColorScheme>(scheme);
  const [log, setLog] = useState<Array<{ id: number; text: string }>>([]);
  const [height, setHeight] = useState<number | null>(null);

  const send = (message: HostMessage) =>
    frameRef.current?.contentWindow?.postMessage(message, window.location.origin);

  const onTwinMessage = useEffectEvent((message: TwinMessage) => {
    if (message.type === 'twindesk:resize') {
      setHeight(message.height);
      return;
    }
    if (message.type === 'twindesk:ready')
      send({ type: 'twindesk:init', version: PROTOCOL_VERSION, scheme: hostScheme });
    const text = describe(message);
    setLog((entries) =>
      entries[0]?.text === text
        ? entries
        : [{ id: Date.now() + Math.random(), text }, ...entries].slice(0, 6),
    );
  });

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const frame = frameRef.current;
      // Exact source and origin checks, as the SDK does.
      if (!frame || event.source !== frame.contentWindow || event.origin !== window.location.origin)
        return;
      const message = parseTwinMessage(event.data);
      if (message) onTwinMessage(message);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const setScheme = (next: ColorScheme) => {
    setHostScheme(next);
    send({ type: 'twindesk:set-scheme', scheme: next });
  };

  return (
    <SettingSection
      title="Embedded preview"
      description={`How ${tenant.productName} looks inside a client’s platform. The host talks to the twin only through typed messages, and each side checks the other’s exact origin.`}
    >
      <div className="grid gap-5 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <div className="overflow-hidden rounded-xl border border-line-strong bg-surface-2 shadow-xl shadow-black/20">
            <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-3 px-3 py-2">
              <span aria-hidden className="flex gap-1.5">
                <span className="size-2.5 rounded-full bg-danger/70" />
                <span className="size-2.5 rounded-full bg-warning/70" />
                <span className="size-2.5 rounded-full bg-success/70" />
              </span>
              <span className="flex items-center gap-1.5 text-[12px] font-semibold text-fg">
                <AppWindow className="size-3.5 text-fg-subtle" aria-hidden /> Your platform
              </span>
              <span className="text-[11px] text-fg-subtle">· client portal</span>
              <div className="ml-auto flex items-center gap-1">
                <Button
                  size="sm"
                  variant={hostScheme === 'light' ? 'secondary' : 'ghost'}
                  className="h-7 px-2"
                  onClick={() => setScheme('light')}
                  aria-pressed={hostScheme === 'light'}
                >
                  <Sun /> Light
                </Button>
                <Button
                  size="sm"
                  variant={hostScheme === 'dark' ? 'secondary' : 'ghost'}
                  className="h-7 px-2"
                  onClick={() => setScheme('dark')}
                  aria-pressed={hostScheme === 'dark'}
                >
                  <Moon /> Dark
                </Button>
              </div>
            </div>
            {/* No sandbox attribute here: for a same-origin frame, allow-scripts plus allow-same-origin
                isolates nothing. Real embeds run on the twin's own origin, framed by the SDK with a sandbox. */}
            <iframe
              ref={frameRef}
              src="/embed/twin"
              title={`${tenant.productName} embedded in a host platform (preview)`}
              referrerPolicy="strict-origin-when-cross-origin"
              loading="lazy"
              className="block h-[640px] w-full border-0 bg-bg"
            />
          </div>
        </div>

        <div className="space-y-4 xl:col-span-2">
          <div className="rounded-xl border border-line bg-surface-2/40 p-4">
            <p className="text-[13px] font-semibold text-fg">Drive it from the host</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-fg-muted">
              These buttons send the same messages a client’s platform would. Questions still pass
              the eight advice checks.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() =>
                  send({ type: 'twindesk:ask', question: 'How close am I to my daily limit?' })
                }
              >
                <Send /> Ask about the daily limit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => send({ type: 'twindesk:ask', question: 'Should I buy EURUSD now?' })}
              >
                Try to break it
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface-2/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-fg">Messages from the twin</p>
              {height ? <Badge tone="neutral">Height {height}px</Badge> : null}
            </div>
            <ul aria-live="polite" className="mt-2 space-y-1 font-mono text-[11.5px] text-fg-muted">
              {log.length === 0 ? (
                <li className="text-fg-subtle">Waiting for the twin to load…</li>
              ) : null}
              {log.map((entry) => (
                <li key={entry.id} className="truncate">
                  <span className="text-brand-fg">←</span> {entry.text}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-2 text-[13px] font-semibold text-fg">Embed it with the SDK</p>
            <pre className="max-h-72 overflow-auto rounded-xl border border-line bg-bg p-3.5 font-mono text-[11.5px] leading-relaxed text-fg-muted">
              <code>{SNIPPET}</code>
            </pre>
            <p className="mt-2 text-[12px] leading-relaxed text-fg-subtle">
              The twin runs in a sandboxed iframe on its own origin. The host cannot read its
              storage or traffic, and only origins your firm lists can frame it.
            </p>
          </div>
        </div>
      </div>
    </SettingSection>
  );
}
