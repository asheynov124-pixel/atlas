/**
 * SHA-256 hex digest for the app-lock PIN; the PIN itself is never stored.
 * WebCrypto only exists in secure contexts, so plain-http LAN testing falls
 * back to a salted, iterated FNV hash. The lock is a privacy curtain either way.
 */
import { hashString } from './prng';

export async function sha256(text: string): Promise<string> {
  const input = `ph-discovery:${text}`;
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h = input;
  for (let i = 0; i < 2000; i++) h = hashString(h + i).toString(16) + h.slice(0, 24);
  return `fnv:${h.slice(0, 32)}`;
}
