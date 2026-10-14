/** Single app password. The cookie holds an HMAC of the password with a server secret, never the password. */
const enc = new TextEncoder();
export const COOKIE = 'modus_session';

async function hmac(value: string): Promise<string> {
  const secret = process.env.APP_SECRET ?? process.env.APP_PASSWORD ?? '';
  const key = await crypto.subtle.importKey('raw', enc.encode(`modus:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(value));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
export async function sessionToken(): Promise<string> { return hmac(`session:v1:${process.env.APP_PASSWORD ?? ''}`); }
export async function isValidSession(token: string | undefined): Promise<boolean> {
  if (!process.env.APP_PASSWORD) return true;           // no password configured → open (local dev)
  if (!token) return false;
  const expect = await sessionToken();
  if (token.length !== expect.length) return false;
  let diff = 0; for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ expect.charCodeAt(i);
  return diff === 0;
}
export function passwordMatches(input: string): boolean {
  const want = process.env.APP_PASSWORD ?? '';
  if (input.length !== want.length) return false;
  let diff = 0; for (let i = 0; i < want.length; i++) diff |= input.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}
