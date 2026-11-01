/**
 * Minimal key-value storage port. Web uses sessionStorage, React Native will use SecureStore,
 * tests use memory. Only non-sensitive state belongs here: session tokens live in HttpOnly
 * cookies (web) or the OS keychain (mobile), never in JavaScript-readable storage.
 */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export function createMemoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    get: (key) => map.get(key) ?? null,
    set: (key, value) => void map.set(key, value),
    remove: (key) => void map.delete(key),
  };
}
