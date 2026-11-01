import type { z } from 'zod';

/**
 * Parses a `text/event-stream` body into validated events. Each `data:` payload must be JSON that
 * matches the schema; anything else ends the stream with an error rather than reaching the UI.
 * Works with any fetch implementation that exposes a ReadableStream body (browsers, Node, Expo).
 */
export async function* readEventStream<T>(
  body: ReadableStream<Uint8Array>,
  schema: z.ZodType<T>,
  { maxEventBytes = 256_000 }: { maxEventBytes?: number } = {},
): AsyncGenerator<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > maxEventBytes) throw new Error('Stream event exceeded the size limit');

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = frame
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (data) yield schema.parse(JSON.parse(data));
        boundary = buffer.indexOf('\n\n');
      }
    }
  } finally {
    reader.releaseLock();
  }
}
