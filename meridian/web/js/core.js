/* Shared client core: session, matter context, API, toasts, overlay, provenance card, live events. */
export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = (n) => `$${Number(n || 0).toFixed(2)}`;
export const prettyDate = (iso) => { const d = new Date(`${iso}T00:00:00Z`); return isNaN(d) ? iso : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); };

export const session = { user: null, matter: null, matters: [], live: false, provider: '', courtlistener: false };
const listeners = new Map();
export function on(ev, fn) { if (!listeners.has(ev)) listeners.set(ev, new Set()); listeners.get(ev).add(fn); }
export function emit(ev, data) { for (const fn of listeners.get(ev) ?? []) { try { fn(data); } catch (e) { console.error(e); } } }

export async function api(path, opts = {}) {
  const headers = { ...(opts.raw ? {} : { 'content-type': 'application/json' }), ...(session.matter ? { 'x-matter': session.matter } : {}), ...(opts.headers ?? {}) };
  const r = await fetch(path, { method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'), headers, body: opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined), credentials: 'same-origin' });
  const isJson = (r.headers.get('content-type') ?? '').includes('json');
  const data = isJson ? await r.json().catch(() => ({})) : await r.text();
  if (r.status === 401) { emit('signed-out'); throw new Error(data.error ?? 'Sign in to continue.'); }
  if (!r.ok) { const e = new Error((data && data.error) || r.statusText); e.status = r.status; e.data = data; throw e; }
  return data;
}

export const withMatter = (path) => `${path}${path.includes('?') ? '&' : '?'}matter=${encodeURIComponent(session.matter ?? '')}`;

export function toast(text, kind = '') {
  const box = $('toasts');
  while (box.children.length >= 3) box.firstChild.remove();
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.textContent = text;
  box.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

export function openOverlay(title, html) { $('overlay-title').textContent = title; $('overlay-body').innerHTML = html; $('overlay').hidden = false; return $('overlay-body'); }
export function closeOverlay() { $('overlay').hidden = true; }
$('overlay-close').addEventListener('click', closeOverlay);
$('overlay').addEventListener('click', (e) => { if (e.target === $('overlay')) closeOverlay(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeOverlay(); $('sel-pop').hidden = true; } });

/** [[ep:...]] pointers in text become clickable source chips. */
export function linkPointers(html) { return html.replace(/\[\[(ep:[^\]\[]+)\]\]/g, (_, p) => `<button class="prov" data-pointer="${esc(p)}" title="${esc(p)}">src</button>`); }

/** Provenance card: the verbatim passage, highlighted inside its source, with the human cite. */
export async function showPointer(pointer, opts = {}) {
  const host = opts.host ?? $('prov-card');
  host.hidden = false;
  host.innerHTML = `<p class="eyebrow">Provenance${opts.marker ? ` ⟦${opts.marker}⟧` : ''}</p><div class="muted small">Resolving…</div>`;
  try {
    const s = await api(`/v1/memory/spans/${encodeURIComponent(pointer)}`);
    const full = esc(s.full), span = esc(s.text);
    const idx = full.indexOf(span);
    const excerpt = idx >= 0 ? `${full.slice(Math.max(0, idx - 200), idx)}<mark>${span}</mark>${full.slice(idx + span.length, idx + span.length + 200)}` : span;
    const cite = s.cite ?? s.source ?? s.role;
    host.innerHTML = `<p class="eyebrow">Provenance${opts.marker ? ` ⟦${opts.marker}⟧` : ''}</p>
      <div class="cite-line">${esc(cite)}</div>
      <div class="src">${esc(s.law ? s.law.cite : s.doc ? s.doc.name : s.source ?? '')} ${s.trusted ? '' : '<span class="untrusted">untrusted content (document or tool result)</span>'}</div>
      <blockquote>${excerpt.replace(/\[\*(\d+)\]/g, '<span class="star">*$1</span>')}</blockquote>
      <div class="ptr">${esc(pointer)}</div>
      <div class="actions"><button class="ghost" data-act="open">Open full source</button><button class="ghost" data-act="copy">Copy cite</button><button class="ghost" data-act="draft">Use in draft</button><button class="ghost" data-act="close">Close</button></div>`;
    host.querySelector('[data-act="open"]').onclick = () => openSource(s);
    host.querySelector('[data-act="copy"]').onclick = async () => { const text = `“${s.text.replace(/\s+/g, ' ').trim()}” (${cite})`; try { await navigator.clipboard.writeText(text); toast('Copied with cite'); } catch { toast(text); } };
    host.querySelector('[data-act="draft"]').onclick = () => { emit('insert-cite', { kind: s.law ? 'law' : 'record', pointer, text: s.text, cite, case_id: s.law?.case_id }); toast('Sent to the open draft'); };
    host.querySelector('[data-act="close"]').onclick = () => { host.hidden = true; };
  } catch (e) {
    host.innerHTML = `<p class="eyebrow">Provenance</p><div class="alert bad">Pointer does not resolve: ${esc(pointer)}. This is exactly the failure the evidence verifier exists to catch.</div>`;
  }
}

export async function openSource(s) {
  if (s.doc) { const d = await api(`/v1/docs/${encodeURIComponent(s.doc.id)}`); return openDoc(d, s.start, s.end); }
  const full = esc(s.full), span = esc(s.text), idx = full.indexOf(span);
  openOverlay(s.law ? s.law.cite : 'Source', `<pre class="opinion">${(idx >= 0 ? `${full.slice(0, idx)}<mark id="hit">${span}</mark>${full.slice(idx + span.length)}` : full).replace(/\[\*(\d+)\]/g, '<span class="star">*$1</span>')}</pre>`);
  document.getElementById('hit')?.scrollIntoView({ block: 'center' });
}

/** Document viewer with page and line numbers, as a court reporter would print them. */
export function openDoc(d, hitStart, hitEnd) {
  let html = `<p class="small muted">${esc(d.kind.toUpperCase())} · ${d.pages} page${d.pages === 1 ? '' : 's'}${d.bates_first ? ` · ${esc(d.bates_first)}–${esc(d.bates_last)}` : ''}${d.scanned_pages.length ? ` · scanned page${d.scanned_pages.length > 1 ? 's' : ''} ${d.scanned_pages.join(', ')}${d.ocr_pages.length ? ' (OCR)' : ' (OCR pending)'}` : ''}</p><div class="docview">`;
  let page = 0;
  for (const l of d.lines) {
    if (l.page !== page) { page = l.page; if (d.kind === 'pdf' || d.pages > 1) html += `<div class="pg">Page ${page}${l.bates ? ` · ${esc(l.bates)}` : ''}</div>`; }
    const hit = hitStart !== undefined && l.end > hitStart && l.start < hitEnd;
    html += `<div class="ln ${hit ? 'hit' : ''}" ${hit ? 'id="hit"' : ''}><b>${l.line}</b><span class="${l.pending ? 'pending' : ''}">${esc(l.text)}${l.ocr ? ' <span class="tag warn">OCR</span>' : ''}</span></div>`;
  }
  openOverlay(d.name, `${html}</div>`);
  document.getElementById('hit')?.scrollIntoView({ block: 'center' });
}

/** One SSE connection per matter; views subscribe through emit('kernel-event'). */
let es = null;
export function connectEvents() {
  if (es) es.close();
  if (!session.matter) return;
  es = new EventSource(withMatter('/v1/events'));
  const important = {
    'approval.requested': (e) => toast(`Approval needed: ${e.payload.action}`, 'bad'),
    'run.completed': () => toast('Run completed', 'ok'),
    'run.failed': (e) => toast(`Run stopped: ${e.payload.reason}`, 'bad'),
    'policy.blocked': (e) => toast(`Blocked by ${e.payload.rule_id}: ${e.payload.tool}`, 'bad'),
    'run.paused': () => toast('Run paused: waiting on you'),
    'doc.ingested': (e) => toast(`Ingested ${e.payload.name}${e.payload.bates_first ? ` (${e.payload.bates_first}–${e.payload.bates_last})` : ''}`),
    'deadline.proposed': (e) => toast(`Deadline found: ${e.payload.title} · ${prettyDate(e.payload.due)}`),
    'tripwire.tripped': (e) => toast(`Tripwire: ${e.payload.by_doc} contradicts ¶${e.payload.paragraph}`, 'bad'),
    'memory.quarantined': (e) => toast(`Quarantined an unverified fact: ${e.payload.attribute}`),
  };
  const names = ['hello', 'plan.ready', 'plan.approved', 'task.started', 'task.progress', 'task.completed', 'task.blocked', 'grader.result', 'approval.requested', 'approval.decided', 'approval.expired', 'approval.invalidated', 'policy.blocked', 'policy.question', 'run.completed', 'run.failed', 'run.paused', 'memory.quarantined', 'sentinel.alert', 'compaction.boundary', 'doc.ingested', 'deadline.proposed', 'tripwire.tripped'];
  for (const n of names) es.addEventListener(n, (m) => { let e = {}; try { e = JSON.parse(m.data); } catch {} important[n]?.(e); emit('kernel-event', { name: n, e }); });
  es.onerror = () => { es.close(); setTimeout(connectEvents, 3000); };
}

export function setView(name) {
  document.body.dataset.view = name;
  for (const v of document.querySelectorAll('.view')) v.hidden = v.id !== `view-${name}`;
  for (const b of document.querySelectorAll('[data-view-btn]')) b.classList.toggle('on', b.dataset.viewBtn === name);
  try { localStorage.setItem('meridian.view', name); } catch {}
  emit('view', name);
}

export function draggableCite(el, payload) {
  el.draggable = true;
  el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('application/x-meridian-cite', JSON.stringify(payload)); e.dataTransfer.setData('text/plain', `“${payload.text}” ${payload.cite}`); e.dataTransfer.effectAllowed = 'copy'; });
}
