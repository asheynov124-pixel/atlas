/**
 * "Send to PH Discovery": a bookmarklet you tap while looking at a gallery page.
 *
 * It runs inside that page, because you ran it there, so it sees what your browser has
 * already rendered, including galleries that scripts build. It doesn't fetch anything,
 * and it doesn't send anything to a server. It snapshots the page as rendered and hands
 * the snapshot to the app. The handoff goes to a tab of the app it opens (postMessage),
 * or to the clipboard to paste into Import. The app then runs the same extractor it uses
 * for a saved `.html` page: largest versions, lightboxes, gallery JSON, junk and ad
 * filtering, and the safety gate. That logic lives in one place, not twice.
 */
import { normalizeUrl } from './urls';

/** The app opens with this hash when a bookmarklet is waiting to hand a page over. */
export const HANDOFF_HASH = '#phd-handoff';
/** Largest snapshot the app accepts (characters), the same bound as an uploaded file. */
export const MAX_SNAPSHOT_CHARS = 8 * 1024 * 1024;
const SNAPSHOT_MARK = '<!-- ph-discovery page snapshot: ';

export interface PageHandoff {
  page: string;
  title: string;
  html: string;
}

/**
 * The bookmarklet. It must stay self-contained: it's stringified into a `javascript:`
 * link and runs on someone else's page, so it may not touch anything outside its own
 * body, and the page's CSP rules out a loader script. It builds its panel with DOM calls
 * and CSSOM styles (never innerHTML or `<style>`) inside a shadow root, so neither the
 * page's CSP nor its stylesheets can break it. `app` is null where there's no app
 * address to open (the hosted preview); then it offers Copy only.
 */
export function bookmarkletMain(app: string | null): void {
  const d = document;
  const w = window;
  const ID = 'ph-discovery-panel';
  const LIMIT = 8 * 1024 * 1024;
  const old = d.getElementById(ID);
  if (old) old.remove();
  const here = location.href;
  const site = location.hostname.replace(/^www\./, '');
  const ui = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  // A rough count, only to say what's coming. The app does the real sorting.
  const pics = Array.from(d.images).filter((i) => Math.max(i.naturalWidth || 0, i.width || 0) >= 120 || !!i.closest('a[href]')).length;
  const vids = d.querySelectorAll('video').length;

  /** The page as rendered, minus this panel and the parts that are heavy and never hold media. */
  const snapshot = (lean: boolean): string => {
    const root = d.documentElement.cloneNode(true) as HTMLElement;
    root.querySelectorAll('#' + ID + ', style, link[rel~="stylesheet"], link[rel~="preload"], link[rel~="modulepreload"], script[src], iframe, svg, canvas, template, object, embed, audio').forEach((e) => e.remove());
    root.querySelectorAll('script').forEach((s) => {
      const type = (s.getAttribute('type') || '').toLowerCase();
      const len = (s.textContent || '').length;
      if (len > 1500000 || (lean && type.indexOf('json') < 0)) s.remove();
    });
    const head = root.querySelector('head');
    const base = d.createElement('base');
    base.setAttribute('href', d.baseURI || here);
    if (head) head.insertBefore(base, head.firstChild);
    else root.insertBefore(base, root.firstChild);
    return '<!-- ph-discovery page snapshot: ' + here.replace(/--/g, '%2D%2D') + ' -->\n<!doctype html>\n' + root.outerHTML;
  };
  const take = (): string | null => {
    let html = snapshot(false);
    if (html.length > LIMIT) html = snapshot(true);
    return html.length > LIMIT ? null : html;
  };

  // --- the panel -------------------------------------------------------------
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, style: Record<string, string>, text?: string): HTMLElementTagNameMap[K] => {
    const e = d.createElement(tag);
    Object.assign(e.style, style);
    if (text) e.textContent = text;
    return e;
  };
  const host = make('div', {
    position: 'fixed',
    left: '0',
    right: '0',
    bottom: '0',
    zIndex: '2147483647',
    display: 'flex',
    justifyContent: 'center',
    padding: '0 12px calc(12px + env(safe-area-inset-bottom, 0px))',
    pointerEvents: 'none',
  });
  host.id = ID;
  const root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
  const panel = make('div', {
    all: 'initial',
    pointerEvents: 'auto',
    boxSizing: 'border-box',
    width: '100%',
    maxWidth: '440px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '14px 16px 16px',
    background: '#111117',
    color: '#f4f4f8',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: '18px',
    boxShadow: '0 14px 44px rgba(0,0,0,0.55)',
    font: '15px/1.4 ' + ui,
  });
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Send to PH Discovery');
  const plural = (n: number, one: string) => n + ' ' + one + (n === 1 ? '' : 's');
  const found = pics || vids ? 'About ' + [pics ? plural(pics, 'picture') : '', vids ? plural(vids, 'video') : ''].filter(Boolean).join(' and ') + ' on ' + site + '.' : 'No pictures spotted on ' + site + ' yet.';
  panel.appendChild(make('div', { fontWeight: '700', fontSize: '16px' }, 'Send this page to PH Discovery'));
  panel.appendChild(
    make(
      'div',
      { color: '#b9b9c6', fontSize: '14px' },
      found + ' The app keeps the full-size version of each and leaves out logos and ads. Scroll to the end of the gallery first, so every picture has loaded.',
    ),
  );
  const status = make('div', { fontSize: '14px', color: '#fcd34d' });
  status.setAttribute('role', 'status');
  const say = (text: string, ok?: boolean) => {
    status.textContent = text;
    status.style.color = ok ? '#6ee7b7' : '#fcd34d';
  };
  const row = make('div', { display: 'flex', flexWrap: 'wrap', gap: '8px' });
  const button = (label: string, primary: boolean, run: () => void) => {
    const b = make(
      'button',
      {
        all: 'initial',
        cursor: 'pointer',
        boxSizing: 'border-box',
        padding: '11px 14px',
        borderRadius: '12px',
        font: '600 15px/1 ' + ui,
        background: primary ? 'linear-gradient(135deg, #a78bfa, #f472b6)' : '#262631',
        color: primary ? '#0b0b10' : '#f4f4f8',
      },
      label,
    );
    b.type = 'button';
    b.addEventListener('focus', () => (b.style.boxShadow = '0 0 0 2px #f4f4f8'));
    b.addEventListener('blur', () => (b.style.boxShadow = 'none'));
    b.addEventListener('click', run);
    row.appendChild(b);
    return b;
  };

  const isApp = !!app && here.indexOf(app) === 0;

  const open = () => {
    if (!app) return;
    const html = take();
    if (!html) return say('This page is too large to send (over 8 MB).');
    const origin = new URL(app).origin;
    const tab = w.open(app + '#phd-handoff', '_blank');
    if (!tab) return say('The new tab was blocked. Tap Copy instead, then Paste from clipboard in Import.');
    say('Opening PH Discovery…');
    let done = false;
    const onMessage = (e: MessageEvent) => {
      if (e.source !== tab || e.origin !== origin || !e.data) return;
      if (e.data.type === 'phd-ready') tab.postMessage({ type: 'phd-import', v: 1, page: here, title: d.title, html }, origin);
      else if (e.data.type === 'phd-received') {
        done = true;
        w.removeEventListener('message', onMessage);
        say('Sent. Review it in PH Discovery before you import.', true);
      }
    };
    w.addEventListener('message', onMessage);
    setTimeout(() => {
      if (!done) say('PH Discovery didn’t answer. Some sites cut the link between tabs. Tap Copy, then Paste from clipboard in Import.');
    }, 12000);
  };

  const copy = () => {
    const html = take();
    if (!html) return say('This page is too large to copy (over 8 MB).');
    const done = 'Copied. In PH Discovery, open Library → Import and tap Paste from clipboard.';
    const fallback = () => {
      const ta = make('textarea', { position: 'fixed', top: '0', left: '0', width: '1px', height: '1px', opacity: '0' });
      ta.value = html;
      d.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = d.execCommand('copy');
      } catch {
        ok = false;
      }
      ta.remove();
      if (ok) say(done, true);
      else say('This browser wouldn’t copy from here. Save the page instead (Share → Save to Files) and upload it in Import.');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(html).then(() => say(done, true), fallback);
    else fallback();
  };

  if (isApp) {
    say('This is PH Discovery itself. Open a gallery page and tap the bookmark there.');
  } else {
    if (app) button('Open in PH Discovery', true, open);
    button('Copy for PH Discovery', !app, copy);
  }
  button('Close', false, () => host.remove());
  panel.appendChild(row);
  panel.appendChild(status);
  root.appendChild(panel);
  (d.body || d.documentElement).appendChild(host);
}

/** The bookmark's address. `void` keeps the browser from navigating to a return value. */
export function bookmarkletHref(app: string | null): string {
  const code = `void((${bookmarkletMain.toString()})(${JSON.stringify(app)}))`;
  return `javascript:${encodeURIComponent(code)}`;
}

/** A pasted bookmarklet snapshot, and the page it came from. */
export function snapshotPage(text: string): string | null {
  const head = text.trimStart();
  if (!head.startsWith(SNAPSHOT_MARK)) return null;
  const end = head.indexOf(' -->');
  if (end < 0) return null;
  const page = normalizeUrl(head.slice(SNAPSHOT_MARK.length, end).replace(/%2D%2D/g, '--'));
  return page && /^https?:/i.test(page) ? page : null;
}

/** What a bookmarklet posts to the app tab, checked before anything reads it. */
export function parseHandoff(data: unknown): PageHandoff | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  if (o.type !== 'phd-import' || o.v !== 1) return null;
  if (typeof o.html !== 'string' || !o.html.trim() || o.html.length > MAX_SNAPSHOT_CHARS) return null;
  const page = typeof o.page === 'string' ? normalizeUrl(o.page) : null;
  if (!page || !/^https?:/i.test(page)) return null;
  return { page, title: typeof o.title === 'string' ? o.title.slice(0, 300) : '', html: o.html };
}
