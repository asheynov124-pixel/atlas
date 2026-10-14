/* MODUS service worker: app shell + the last 25 opened dossiers for offline reading. */
const VERSION = 'modus-v1';
const SHELL = `${VERSION}-shell`;
const CASES = `${VERSION}-cases`;
const MAX_CASES = 25;

self.addEventListener('install', (e) => { e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/offline', '/manifest.webmanifest', '/icon.svg']))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))); self.clients.claim(); });

async function trimCases() {
  const cache = await caches.open(CASES);
  const keys = await cache.keys();
  const pages = keys.filter((r) => new URL(r.url).pathname.startsWith('/case/') && !new URL(r.url).pathname.includes('/count/'));
  // keys() is insertion-ordered: delete the oldest beyond MAX_CASES, and their count sub-pages.
  const extra = pages.slice(0, Math.max(0, pages.length - MAX_CASES));
  for (const r of extra) { const slug = new URL(r.url).pathname.split('/')[2]; for (const k of keys) if (new URL(k.url).pathname.startsWith(`/case/${slug}`)) await cache.delete(k); }
}

self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== location.origin) return;
  const isCase = url.pathname.startsWith('/case/');
  const isStatic = url.pathname.startsWith('/_next/static/') || url.pathname === '/icon.svg' || url.pathname === '/manifest.webmanifest';
  if (isStatic) { e.respondWith(caches.open(SHELL).then(async (c) => (await c.match(req)) ?? fetch(req).then((r) => { c.put(req, r.clone()); return r; }))); return; }
  if (isCase && req.mode === 'navigate') {
    // Network first; on success refresh the cache (re-put moves it to the newest slot); offline → cached copy.
    e.respondWith((async () => {
      const cache = await caches.open(CASES);
      try { const r = await fetch(req); if (r.ok) { await cache.delete(req); await cache.put(req, r.clone()); e.waitUntil(trimCases()); } return r; }
      catch { return (await cache.match(req)) ?? (await caches.match('/offline')) ?? Response.error(); }
    })());
    return;
  }
  if (req.mode === 'navigate') e.respondWith(fetch(req).catch(async () => (await caches.match(req)) ?? (await caches.match('/offline')) ?? Response.error()));
});

self.addEventListener('message', async (e) => {
  if (e.data === 'list-cases') { const c = await caches.open(CASES); const ks = await c.keys(); e.source?.postMessage({ cases: ks.map((k) => new URL(k.url).pathname).filter((p) => p.startsWith('/case/') && !p.includes('/count/')) }); }
});
