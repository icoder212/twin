// Crockford-style alphabet without I, L, O and U, so ids read back correctly over the phone.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function randomChars(length: number): string {
  const bytes = new Uint8Array(length);
  // Available in browsers, Node 19+ and React Native (with react-native-get-random-values).
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return out;
}

export function createId(prefix: string): string {
  return `${prefix}_${randomChars(16).toLowerCase()}`;
}

/** Audit id quoted to users and compliance, e.g. DT-K7P2QA. */
export function createAnswerId(): string {
  return `DT-${randomChars(6)}`;
}

/** Reference quoted in every notification, e.g. NT-K7P2QA. */
export function createNotificationRef(): string {
  return `NT-${randomChars(6)}`;
}
