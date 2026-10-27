// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://www.dunes.example/galleries/sunrise-set/"}
// The bookmarklet, run the way a browser runs it: decoded from its javascript: link, in
// the page's global scope, with no access to this module.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bookmarkletHref, parseHandoff, snapshotPage, MAX_SNAPSHOT_CHARS } from '../import/bookmarklet';
import { emptyDrops, finalize, parseInput } from '../import/extract';

const APP = 'https://app.example/discovery/';
const PAGE = 'https://www.dunes.example/galleries/sunrise-set/';
const run = (app: string | null) => (0, eval)(decodeURIComponent(bookmarkletHref(app).slice('javascript:'.length)));
const panel = () => document.getElementById('ph-discovery-panel')?.shadowRoot ?? null;
const buttons = () => [...(panel()?.querySelectorAll('button') ?? [])].map((b) => b.textContent);
const press = (label: string) => [...panel()!.querySelectorAll('button')].find((b) => b.textContent === label)!.click();
const status = () => panel()!.querySelector('[role="status"]')!.textContent;
const fromTab = (source: unknown, origin: string, data: unknown) => {
  const e = new MessageEvent('message', { data, origin });
  Object.defineProperty(e, 'source', { value: source });
  window.dispatchEvent(e);
};

/** What a script-built gallery leaves in the DOM. None of it is in the HTML the site serves. */
function renderGallery() {
  document.head.innerHTML = '<style>.x{color:red}</style><link rel="stylesheet" href="/site.css">';
  document.title = 'Sunrise set';
  document.body.innerHTML = '<main class="gallery"></main><script src="/app.js"></script><svg><path d="M0 0"/></svg>';
  const main = document.querySelector('main')!;
  for (let n = 1; n <= 4; n++) {
    const a = document.createElement('a');
    a.setAttribute('href', `/full/${n}.jpg`); // relative: must resolve against the page
    a.setAttribute('data-fancybox', 'set');
    const img = document.createElement('img');
    img.src = `https://cdn.dunes.example/thumb/${n}.jpg`;
    img.alt = `Dune ${n}`;
    a.appendChild(img);
    main.appendChild(a);
  }
}

beforeEach(() => renderGallery());
afterEach(() => {
  vi.restoreAllMocks();
  document.getElementById('ph-discovery-panel')?.remove();
});

describe('the bookmarklet on a gallery page', () => {
  it('is a javascript: link that runs with nothing but the page around it', () => {
    expect(location.href).toBe(PAGE);
    const href = bookmarkletHref(APP);
    expect(href.startsWith('javascript:')).toBe(true);
    expect(() => run(APP)).not.toThrow();
    expect(panel()!.textContent).toContain('Send this page to PH Discovery');
    expect(panel()!.textContent).toContain('About 4 pictures on dunes.example.');
    expect(buttons()).toEqual(['Open in PH Discovery', 'Copy for PH Discovery', 'Close']);
  });

  it('opens the app, waits for it, and hands the snapshot only to that tab', () => {
    const tab = { postMessage: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    run(APP);
    press('Open in PH Discovery');
    expect(open).toHaveBeenCalledWith(`${APP}#phd-handoff`, '_blank');
    fromTab({ postMessage: vi.fn() }, 'https://app.example', { type: 'phd-ready' }); // some other window
    fromTab(tab, 'https://evil.example', { type: 'phd-ready' }); // right window, wrong origin
    expect(tab.postMessage).not.toHaveBeenCalled();
    fromTab(tab, 'https://app.example', { type: 'phd-ready' });
    expect(tab.postMessage).toHaveBeenCalledTimes(1);
    const [payload, origin] = tab.postMessage.mock.calls[0];
    expect(origin).toBe('https://app.example');
    const p = parseHandoff(payload)!;
    expect(p).toMatchObject({ page: PAGE, title: 'Sunrise set' });
    // The snapshot: as rendered, without the panel and the heavy parts, with the page as its base.
    expect(p.html).toContain(`<base href="${PAGE}">`);
    expect(p.html).toContain('data-fancybox');
    for (const gone of ['ph-discovery-panel', '<style', 'site.css', '/app.js', '<svg']) expect(p.html).not.toContain(gone);
    fromTab(tab, 'https://app.example', { type: 'phd-received' });
    expect(status()).toBe('Sent. Review it in PH Discovery before you import.');
  });

  it('gives the app a page it reads like a saved one: full-size files, resolved, thumbnails as previews', () => {
    const tab = { postMessage: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    run(APP);
    press('Open in PH Discovery');
    fromTab(tab, 'https://app.example', { type: 'phd-ready' });
    const { html } = parseHandoff(tab.postMessage.mock.calls[0][0])!;
    const parsed = parseInput(html, { filename: 'dunes.example.html' });
    const rows = finalize(parsed.candidates, parsed.dropped ?? emptyDrops()).candidates;
    expect(rows.map((r) => r.url)).toEqual([1, 2, 3, 4].map((n) => `https://www.dunes.example/full/${n}.jpg`));
    expect(rows[0]).toMatchObject({ mediaType: 'image', title: 'Dune 1', thumbnailUrl: 'https://cdn.dunes.example/thumb/1.jpg', originalUrl: PAGE });
  });

  it('says so when the new tab is blocked', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    run(APP);
    press('Open in PH Discovery');
    expect(status()).toMatch(/new tab was blocked/);
  });

  it('Copy puts the same snapshot on the clipboard, and Import recognises it as this page', async () => {
    const writeText = vi.fn(async (_text: string) => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    run(APP);
    press('Copy for PH Discovery');
    await Promise.resolve();
    expect(snapshotPage(writeText.mock.calls[0][0])).toBe(PAGE);
    expect(status()).toMatch(/^Copied\./);
  });

  it('offers Copy only where there is no app address to open', () => {
    run(null);
    expect(buttons()).toEqual(['Copy for PH Discovery', 'Close']);
  });

  it('on the app itself, explains instead of sending', () => {
    run(`${location.origin}/`);
    expect(buttons()).toEqual(['Close']);
    expect(status()).toMatch(/This is PH Discovery itself/);
  });

  it('runs normally on other pages of the same site as the app', () => {
    run(`${location.origin}/somewhere-else/app/`);
    expect(buttons()).toEqual(['Open in PH Discovery', 'Copy for PH Discovery', 'Close']);
  });

  it('running it again replaces the panel; Close removes it', () => {
    run(APP);
    run(APP);
    expect(document.querySelectorAll('#ph-discovery-panel')).toHaveLength(1);
    press('Close');
    expect(panel()).toBeNull();
  });
});

describe('the app checks what arrives', () => {
  const ok = { type: 'phd-import', v: 1, page: PAGE, title: 'Sunrise set', html: '<html><body><img src="a.jpg"></body></html>' };
  it('accepts a well-formed snapshot and nothing else', () => {
    expect(parseHandoff(ok)).toMatchObject({ page: PAGE, title: 'Sunrise set' });
    expect(parseHandoff({ ...ok, type: 'other' })).toBeNull();
    expect(parseHandoff({ ...ok, v: 2 })).toBeNull();
    expect(parseHandoff({ ...ok, html: '  ' })).toBeNull();
    expect(parseHandoff({ ...ok, html: 'x'.repeat(MAX_SNAPSHOT_CHARS + 1) })).toBeNull();
    expect(parseHandoff({ ...ok, page: 'javascript:alert(1)' })).toBeNull();
    expect(parseHandoff('<html>')).toBeNull();
  });

  it('knows a pasted snapshot from any other text', () => {
    expect(snapshotPage(`<!-- ph-discovery page snapshot: ${PAGE} -->\n<!doctype html><html></html>`)).toBe(PAGE);
    expect(snapshotPage('https://img.example/a.jpg')).toBeNull();
    expect(snapshotPage('<!-- ph-discovery page snapshot: javascript:alert(1) -->')).toBeNull();
  });
});
