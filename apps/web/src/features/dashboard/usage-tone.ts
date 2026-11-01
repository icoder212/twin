import type { Tone } from '@twindesk/core';

/** Severity of a usage figure against its limit: fine, getting close, or nearly there. */
export function usageTone(used: number, limit: number): Tone {
  const ratio = used / limit;
  return ratio >= 0.8 ? 'danger' : ratio >= 0.5 ? 'warning' : 'success';
}
