/** Small HTTP toolkit: routing, JSON and raw bodies, cookies, errors. No framework. */
import type { IncomingMessage, ServerResponse } from 'node:http';

export class HttpError extends Error { constructor(readonly status: number, message: string, readonly code?: string) { super(message); } }

export interface Req { raw: IncomingMessage; res: ServerResponse; method: string; path: string; url: URL; params: Record<string, string>; cookies: Record<string, string> }
export type Handler = (r: Req) => Promise<unknown> | unknown;

export class Router {
  private routes: Array<{ method: string; rx: RegExp; keys: string[]; handler: Handler }> = [];
  on(method: string, pattern: string, handler: Handler): this {
    const keys: string[] = [];
    const rx = new RegExp('^' + pattern.replace(/:(\w+)\*?/g, (m, k: string) => { keys.push(k); return m.endsWith('*') ? '(.+)' : '([^/]+)'; }) + '$');
    this.routes.push({ method, rx, keys, handler });
    return this;
  }
  match(method: string, path: string): { handler: Handler; params: Record<string, string> } | null {
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const m = r.rx.exec(path);
      if (m) return { handler: r.handler, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)])) };
    }
    return null;
  }
}

export async function readBody(req: IncomingMessage, limit = 60_000_000): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of req) { n += (c as Buffer).length; if (n > limit) throw new HttpError(413, 'Upload too large.'); chunks.push(c as Buffer); }
  return Buffer.concat(chunks);
}

export async function readJson<T = Record<string, unknown>>(req: IncomingMessage): Promise<T> {
  const raw = (await readBody(req, 5_000_000)).toString('utf8');
  if (!raw) return {} as T;
  try { return JSON.parse(raw) as T; } catch { throw new HttpError(400, 'Body must be JSON.'); }
}

export function parseCookies(h: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (h ?? '').split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return out;
}

export function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  if (res.headersSent) return;
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

export function sendText(res: ServerResponse, status: number, body: string, type: string, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...headers });
  res.end(body);
}
