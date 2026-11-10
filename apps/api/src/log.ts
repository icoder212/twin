/**
 * The only place the server writes to the console (Workers logs). Never log tokens, phone
 * numbers, addresses or event titles: counts, statuses and error messages only.
 */
export function log(event: string, details: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, ...details }));
}

export function logError(event: string, error: unknown): void {
  console.error(
    JSON.stringify({ event, error: error instanceof Error ? error.message : String(error) }),
  );
}
