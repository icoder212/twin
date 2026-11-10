/** Small Web Crypto helpers. Everything here runs the same in Workers and in Node for tests. */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytes(length: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(length));
  crypto.getRandomValues(out);
  return out;
}

export function toBase64Url(data: Uint8Array): string {
  let binary = '';
  for (const b of data) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function decodeBase64UrlText(text: string): string {
  return decoder.decode(fromBase64Url(text));
}

export function randomToken(length = 32): string {
  return toBase64Url(bytes(length));
}

/** PKCE S256 code challenge for a verifier. */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(verifier));
  return toBase64Url(new Uint8Array(digest));
}

async function aesKey(keyBase64: string): Promise<CryptoKey> {
  const raw = fromBase64Url(keyBase64.trim());
  if (raw.length !== 32) throw new Error('TOKEN_KEY must be 32 bytes, base64');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** AES-GCM: "iv.ciphertext", both base64url. Tampering makes `unseal` throw. */
export async function seal(plain: string, keyBase64: string): Promise<string> {
  const iv = bytes(12);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await aesKey(keyBase64),
    encoder.encode(plain),
  );
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ct))}`;
}

export async function unseal(sealed: string, keyBase64: string): Promise<string> {
  const [iv = '', ct = ''] = sealed.split('.');
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64Url(iv) },
    await aesKey(keyBase64),
    fromBase64Url(ct),
  );
  return decoder.decode(plain);
}

export async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Compares secrets without leaking where they differ through timing. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
