/**
 * Page scanning: the only network step of an import, and only ever started by
 * the user. A plain CORS request with no credentials — no proxies, no
 * workarounds. If the site doesn't allow cross-origin reads, the scan fails
 * honestly and the page stays importable as an "open original" clip.
 */
import { extractFromHtml, type Extraction } from './extract';
import { classifyUrl } from './urls';
import type { MediaType, ScanError } from './types';

export type ScanResult =
  | { ok: true; url: string; extraction: Extraction; finalUrl: string }
  | { ok: true; url: string; media: MediaType; finalUrl: string }
  | { ok: false; url: string; error: ScanError };

const TIMEOUT_MS = 12_000;
const MAX_BYTES = 6 * 1024 * 1024;

export async function scanPage(url: string, opts: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {}): Promise<ScanResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  opts.signal?.addEventListener('abort', onAbort);
  try {
    const res = await doFetch(url, { mode: 'cors', credentials: 'omit', redirect: 'follow', referrerPolicy: 'no-referrer', signal: ctrl.signal });
    if (!res.ok) return { ok: false, url, error: { kind: 'http', message: `The site answered ${res.status}${res.statusText ? ` ${res.statusText}` : ''}.` } };
    const type = (res.headers.get('content-type') ?? '').toLowerCase();
    const finalUrl = res.url || url;
    if (type.startsWith('image/')) return { ok: true, url, media: 'image', finalUrl };
    if (type.startsWith('video/')) return { ok: true, url, media: 'video', finalUrl };
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len > MAX_BYTES) return { ok: false, url, error: { kind: 'too-large', message: 'That page is too large to scan here.' } };
    if (type && !type.includes('html') && !type.includes('xml') && !type.startsWith('text/')) {
      const guess = classifyUrl(finalUrl);
      if (guess !== 'page') return { ok: true, url, media: guess, finalUrl };
      return { ok: false, url, error: { kind: 'not-html', message: `Not a web page (${type.split(';')[0]}).` } };
    }
    const html = await readCapped(res, MAX_BYTES);
    if (html === null) return { ok: false, url, error: { kind: 'too-large', message: 'That page is too large to scan here.' } };
    if (!html.trim()) return { ok: false, url, error: { kind: 'empty', message: 'The page came back empty.' } };
    return { ok: true, url, extraction: extractFromHtml(html, finalUrl), finalUrl };
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      return opts.signal?.aborted
        ? { ok: false, url, error: { kind: 'timeout', message: 'Scan cancelled.' } }
        : { ok: false, url, error: { kind: 'timeout', message: 'The site took too long to answer.' } };
    }
    // Browsers report a CORS refusal and being offline as the same opaque TypeError.
    return {
      ok: false,
      url,
      error: {
        kind: 'cors',
        message: typeof navigator !== 'undefined' && navigator.onLine === false ? 'You’re offline.' : 'The site doesn’t allow other apps to read its pages (CORS).',
      },
    };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

/** Read a body up to `max` bytes, stopping the download (not just the parse) past the limit. */
async function readCapped(res: Response, max: number): Promise<string | null> {
  const reader = res.body?.getReader?.();
  if (!reader) {
    const t = await res.text();
    return t.length > max ? null : t;
  }
  const decoder = new TextDecoder();
  let size = 0;
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    out += decoder.decode(value, { stream: true });
  }
  return out + decoder.decode();
}

/** Scan several pages with bounded concurrency, reporting each result as it lands. */
export async function scanPages(
  urls: string[],
  onResult: (r: ScanResult, done: number, total: number) => void,
  opts: { signal?: AbortSignal; concurrency?: number; fetchImpl?: typeof fetch } = {},
): Promise<ScanResult[]> {
  const results: ScanResult[] = [];
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < urls.length && !opts.signal?.aborted) {
      const url = urls[next++];
      const r = await scanPage(url, opts);
      results.push(r);
      onResult(r, ++done, urls.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 3, urls.length) }, worker));
  return results;
}

/**
 * What to tell someone when a gallery page gave up no media. The advice is
 * always the same (open it, copy direct image links, paste those); the reason
 * in brackets is the real one.
 */
export function zeroMediaMessage(error?: ScanError): string {
  const why =
    !error || error.kind === 'cors'
      ? 'site blocked access'
      : error.kind === 'empty'
        ? 'its pictures are added by scripts this app doesn’t run'
        : error.kind === 'http'
          ? error.message.replace(/^The site answered (\d+).*$/, 'the site answered $1').replace(/\.$/, '')
          : error.kind === 'timeout'
            ? 'the site didn’t answer in time'
            : error.kind === 'too-large'
              ? 'the page is too large to read here'
              : 'it isn’t a web page';
  return `Could not read images from this page (${why}). Open the page, copy direct image links, and paste those instead.`;
}
