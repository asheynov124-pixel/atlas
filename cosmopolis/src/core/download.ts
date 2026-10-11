/**
 * offerFile — the ONE way Cosmopolis hands the player a file (photos, city exports, Studio snapshots).
 *
 *  • Inside the claude.ai artifact viewer (`window.claude` exists, carrying only `use()`): `<a download>` and
 *    object-URL saves are inert and the Web Share API is refused, so files go through the runtime's `downloads`
 *    capability: `await window.claude.use('downloads')` → namespace | null, then `downloads.save({ filename, data })`
 *    → `{ status: 'saved' | 'delivered' }` once the viewer accepts, or a rejection `{ code }`. The capability lookup
 *    can take ~10 s to resolve to null when no viewer answers, so it is raced against 1.5 s and memoised from startup
 *    (`prepareDownloads()` in main.tsx); a late answer is still picked up by later offers.
 *  • Everywhere else: the share sheet with a File where the platform supports it (iOS), else `<a download>`.
 *
 * Call it straight from a click/tap handler (a user gesture). 'declined' (the player said no) is silent; any other
 * failure is reported through `opts.notify` with a friendly message.
 */

export type OfferResult = 'saved' | 'shared' | 'declined' | 'unavailable';

export interface OfferOptions {
  /** prefer the native share sheet outside the artifact viewer (default true; false = plain download) */
  share?: boolean;
  /** share sheet title / text */
  title?: string;
  text?: string;
  /** toast sink for failures (ui/store notify) */
  notify?: (n: { title: string; body?: string; kind?: 'info' | 'good' | 'warn' | 'bad'; icon?: string }) => void;
}

interface DownloadsNamespace {
  save(req: { filename: string; data: Blob }): Promise<{ status?: string } | undefined>;
}

interface ClaudeRuntime {
  use(name: string): Promise<unknown>;
}

/** Extensions the artifact downloads capability accepts. */
export const ARTIFACT_EXTENSIONS = ['gif', 'png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm', 'txt', 'json', 'md', 'docx', 'pptx', 'epub', 'csv', 'ttf', 'html', 'svg', 'pdf', 'xlsx', 'zip'];

const LOOKUP_TIMEOUT_MS = 1500;

let lookup: Promise<DownloadsNamespace | null> | null = null;
/** set whenever the capability answers, even after the race was lost */
let resolved: DownloadsNamespace | null = null;

function runtime(): ClaudeRuntime | null {
  try {
    const c = (globalThis as { claude?: unknown }).claude as ClaudeRuntime | undefined;
    return c && typeof c.use === 'function' ? c : null;
  } catch {
    return null;
  }
}

/** True inside the claude.ai artifact viewer (files must go through the downloads capability). */
export function inArtifactViewer(): boolean {
  return runtime() !== null;
}

function isNamespace(x: unknown): x is DownloadsNamespace {
  return !!x && typeof (x as DownloadsNamespace).save === 'function';
}

/** Start (once) resolving the downloads capability. Safe to call anywhere; never rejects. */
export function prepareDownloads(): Promise<DownloadsNamespace | null> {
  if (lookup) return lookup;
  const rt = runtime();
  if (!rt) return (lookup = Promise.resolve(null));
  lookup = new Promise<DownloadsNamespace | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), LOOKUP_TIMEOUT_MS);
    let p: Promise<unknown>;
    try {
      p = Promise.resolve(rt.use('downloads'));
    } catch {
      p = Promise.resolve(null);
    }
    p.then(
      (ns) => {
        if (isNamespace(ns)) resolved = ns;
        clearTimeout(timer);
        resolve(resolved);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
  return lookup;
}

/** Friendly text for a downloads capability rejection code. */
export function offerProblem(code: string | undefined): { title: string; body: string } {
  switch (code) {
    case 'too_large':
      return { title: 'File too large', body: 'That file is too big to save from here.' };
    case 'rate_limited':
      return { title: 'One moment', body: 'Too many files at once — try again in a few seconds.' };
    case 'unavailable':
    case 'not_granted':
    case 'capability_disabled':
    case 'capability_removed':
    case 'extension_not_enabled':
      return { title: 'Saving files is off here', body: 'This viewer isn’t letting Cosmopolis save files right now.' };
    default:
      return { title: 'Could not save the file', body: 'Something went wrong handing it over — please try again.' };
  }
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

/** Offer a file to the player (see header). */
export async function offerFile(filename: string, blob: Blob, opts: OfferOptions = {}): Promise<OfferResult> {
  if (runtime()) return offerThroughViewer(filename, blob, opts);
  return offerInBrowser(filename, blob, opts);
}

async function offerThroughViewer(filename: string, blob: Blob, opts: OfferOptions): Promise<OfferResult> {
  const ns = resolved ?? (await prepareDownloads());
  if (!ns) {
    opts.notify?.({ ...offerProblem('unavailable'), kind: 'warn', icon: 'download' });
    return 'unavailable';
  }
  if (!ARTIFACT_EXTENSIONS.includes(extOf(filename))) console.warn(`[download] ${filename}: extension not accepted by the viewer`);
  try {
    await ns.save({ filename, data: blob });
    return 'saved';
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    if (code === 'declined') return 'declined';
    console.warn('[download] save rejected', code ?? e);
    opts.notify?.({ ...offerProblem(code), kind: 'warn', icon: 'download' });
    return 'unavailable';
  }
}

async function offerInBrowser(filename: string, blob: Blob, opts: OfferOptions): Promise<OfferResult> {
  if (opts.share !== false) {
    try {
      const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: opts.title, text: opts.text });
        return 'shared';
      }
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'declined';
      // NotAllowedError (no gesture / blocked) etc.: fall back to a download
    }
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'saved';
  } catch (e) {
    console.warn('[download] download failed', e);
    opts.notify?.({ ...offerProblem(undefined), kind: 'warn', icon: 'download' });
    return 'unavailable';
  }
}
