import { act } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderWithApp } from '@/test/render';
import { EmbedBridge } from './EmbedBridge';
import { useEmbedStore } from './embed-store';

function Harness() {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref}>
      <EmbedBridge contentRef={ref} />
    </div>
  );
}

let host: Window;

function post(data: unknown, origin: string, source: Window = host) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data, origin, source }));
  });
}

describe('EmbedBridge', () => {
  // Simulate running inside a host page: the bridge only listens when it has a parent window.
  beforeEach(() => {
    useEmbedStore.setState({ pendingQuestion: null });
    const frame = document.createElement('iframe');
    document.body.append(frame);
    host = frame.contentWindow as Window;
    Object.defineProperty(window, 'parent', { value: host, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(window, 'parent', { value: window, configurable: true });
    document.querySelectorAll('iframe').forEach((f) => f.remove());
  });

  it('ignores messages that do not come from the parent window', () => {
    renderWithApp(<Harness />);
    post(
      { type: 'twindesk:ask', question: 'Why was my account closed?' },
      window.location.origin,
      window,
    );
    expect(useEmbedStore.getState().pendingQuestion).toBeNull();
  });

  it('ignores messages from origins that are not allowed', () => {
    renderWithApp(<Harness />);
    post({ type: 'twindesk:ask', question: 'Why was my account closed?' }, 'https://evil.example');
    expect(useEmbedStore.getState().pendingQuestion).toBeNull();
  });

  it('ignores messages that do not match the protocol', () => {
    renderWithApp(<Harness />);
    post({ type: 'twindesk:ask', question: 42 }, window.location.origin);
    post({ type: 'twindesk:run-anything', code: 'x' }, window.location.origin);
    expect(useEmbedStore.getState().pendingQuestion).toBeNull();
  });

  it('accepts a valid question from a trusted origin, sanitised', () => {
    renderWithApp(<Harness />);
    post(
      { type: 'twindesk:ask', question: 'How close am I\u200B to my limit?' },
      window.location.origin,
    );
    expect(useEmbedStore.getState().pendingQuestion).toBe('How close am I to my limit?');
  });
});
