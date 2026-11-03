/* Drafts: editor with drag-and-drop pin cites, verification, table of authorities, Word export. */
import { $, api, esc, session, on, toast, draggableCite, withMatter, setView } from './core.js';

const ds = { list: [], cur: null, tab: 'quotes', saveTimer: null };

async function loadList() {
  if (!session.matter) return;
  ds.list = await api('/v1/drafts');
  $('d-items').innerHTML = ds.list.map((d) => `<li data-id="${d.id}" class="${ds.cur?.id === d.id ? 'on' : ''}">${esc(d.title)}<small>${new Date(d.updated_at).toLocaleString()}</small></li>`).join('') || '<li class="muted small">No drafts yet.</li>';
  $('d-items').querySelectorAll('li[data-id]').forEach((li) => li.addEventListener('click', () => openDraft(li.dataset.id)));
}

async function openDraft(id) {
  ds.cur = await api(`/v1/drafts/${id}`);
  $('d-empty').hidden = true; $('d-editor-wrap').hidden = false;
  $('d-title').value = ds.cur.title;
  $('d-editor').innerHTML = ds.cur.body || '<p>Start writing. Drag a quote or record cite here.</p>';
  $('d-report').hidden = true;
  $('d-saved').textContent = 'Saved';
  try { localStorage.setItem(`meridian.draft.${session.matter}`, id); } catch {}
  loadList();
}

$('d-new').addEventListener('click', async () => { const d = await api('/v1/drafts', { body: { title: 'Untitled draft', body: '<h2>Statement of the standard</h2><p></p>' } }); await openDraft(d.id); $('d-title').select(); });

function scheduleSave() {
  $('d-saved').textContent = 'Saving…';
  clearTimeout(ds.saveTimer);
  ds.saveTimer = setTimeout(async () => { if (!ds.cur) return; ds.cur = await api(`/v1/drafts/${ds.cur.id}`, { method: 'PUT', body: { title: $('d-title').value, body: $('d-editor').innerHTML } }); $('d-saved').textContent = 'Saved'; loadList(); }, 700);
}
$('d-editor').addEventListener('input', scheduleSave);
$('d-title').addEventListener('input', scheduleSave);

document.querySelectorAll('[data-cmd]').forEach((b) => b.addEventListener('click', () => {
  const c = b.dataset.cmd;
  if (c === 'bold' || c === 'italic') document.execCommand(c);
  if (c === 'h2') document.execCommand('formatBlock', false, 'h2');
  if (c === 'p') document.execCommand('formatBlock', false, 'p');
  $('d-editor').focus(); scheduleSave();
}));

export function citeToken(p) {
  const pin = /at (\d+(?:-\d+)?)/.exec(p.cite ?? '')?.[1];
  const span = document.createElement('span');
  span.className = `cite ${p.kind === 'record' ? 'record' : 'law'}`;
  span.contentEditable = 'false';
  if (p.kind === 'record') span.dataset.pointer = p.pointer;
  else { span.dataset.case = p.case_id; if (p.quote_id) span.dataset.quote = p.quote_id; if (pin) span.dataset.pin = pin; }
  const text = String(p.text ?? '').replace(/\s+/g, ' ').trim();
  span.textContent = p.kind === 'record' ? `“${text}” (${p.cite}).` : `“${text}” ${p.cite}${p.note ? ` (${p.note})` : ''}.`;
  return span;
}

function insertAt(node, range) {
  const ed = $('d-editor');
  if (!range || !ed.contains(range.startContainer)) { ed.appendChild(node); }
  else { range.insertNode(node); }
  node.after(document.createTextNode(' '));
  scheduleSave();
}

const ed = $('d-editor');
ed.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('application/x-meridian-cite')) { e.preventDefault(); ed.classList.add('over'); } });
ed.addEventListener('dragleave', () => ed.classList.remove('over'));
ed.addEventListener('drop', async (e) => {
  const raw = e.dataTransfer.getData('application/x-meridian-cite');
  ed.classList.remove('over');
  if (!raw) return;
  e.preventDefault();
  const p = JSON.parse(raw);
  const range = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : (() => { const pos = document.caretPositionFromPoint?.(e.clientX, e.clientY); if (!pos) return null; const r = document.createRange(); r.setStart(pos.offsetNode, pos.offset); return r; })();
  insertAt(citeToken(p), range);
  if (p.quote_id) api(`/v1/research/quotes/${p.quote_id}/use`, { body: {} }).catch(() => {});
});

on('insert-cite', async (p) => {
  if (!ds.cur) { const d = await api('/v1/drafts', { body: { title: 'Untitled draft', body: '<p></p>' } }); await openDraft(d.id); }
  setView('drafts');
  insertAt(citeToken(p), null);
});

$('d-verify').addEventListener('click', async () => {
  if (!ds.cur) return;
  clearTimeout(ds.saveTimer);
  ds.cur = await api(`/v1/drafts/${ds.cur.id}`, { method: 'PUT', body: { title: $('d-title').value, body: $('d-editor').innerHTML } });
  const v = await api(`/v1/drafts/${ds.cur.id}/verify`, { body: {} });
  const tokens = [...$('d-editor').querySelectorAll('.cite')];
  tokens.forEach((t) => t.classList.remove('ok', 'bad'));
  for (const c of v.checks) { const t = tokens[c.index - 1]; if (t && c.kind !== 'typed') t.classList.add(c.status === 'verified' ? 'ok' : 'bad'); }
  const icon = { verified: '✓', wrong_pin: '⚠', not_verbatim: '✗', unknown_authority: '?', dangling: '✗' };
  $('d-report').hidden = false;
  $('d-report').innerHTML = `<h3>${esc(v.summary)}</h3>${v.checks.map((c) => `<div class="check-row" data-i="${c.index}"><span class="tag ${c.status === 'verified' ? 'ok' : c.status === 'wrong_pin' ? 'warn' : 'bad'}">${icon[c.status]} ${esc(c.status.replace(/_/g, ' '))}</span><div>${c.quote ? `“${esc(c.quote.slice(0, 120))}${c.quote.length > 120 ? '…' : ''}” ` : ''}<span class="cite-line">${esc(c.cite)}</span><div class="small muted">${esc(c.detail)}${c.expected && c.status === 'wrong_pin' ? ` Correct cite: ${esc(c.expected)}.` : ''}${c.kind === 'typed' ? ' (typed in the draft)' : ''}</div></div></div>`).join('')}`;
  $('d-report').querySelectorAll('.check-row').forEach((r) => r.addEventListener('click', () => tokens[Number(r.dataset.i) - 1]?.scrollIntoView({ block: 'center' })));
  $('d-report').scrollIntoView({ behavior: 'smooth' });
});

$('d-toa').addEventListener('click', async () => {
  if (!ds.cur) return;
  const v = await api(`/v1/drafts/${ds.cur.id}/verify`, { body: {} });
  if (!v.authorities.length) return toast('No authorities in the draft yet.');
  const h = document.createElement('div');
  h.innerHTML = `<h2>Table of Authorities</h2><p><b>Cases</b></p>${v.authorities.map((a) => `<p>${esc(a.cite)}${a.uses > 1 ? ' (passim)' : ''}</p>`).join('')}`;
  $('d-editor').prepend(...h.childNodes);
  scheduleSave();
  toast('Table of authorities added at the top');
});

$('d-export').addEventListener('click', () => { if (ds.cur) window.location.href = withMatter(`/v1/drafts/${ds.cur.id}/export.doc`); });
$('d-delete').addEventListener('click', async () => { if (!ds.cur || !confirm(`Delete “${ds.cur.title}”?`)) return; await api(`/v1/drafts/${ds.cur.id}`, { method: 'DELETE' }); ds.cur = null; $('d-editor-wrap').hidden = true; $('d-empty').hidden = false; loadList(); });

async function renderSide() {
  const q = $('d-filter').value.trim();
  const box = $('d-cards');
  box.innerHTML = '<p class="muted small">Loading…</p>';
  if (ds.tab === 'quotes') {
    const quotes = await api(`/v1/research/quotes${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    box.innerHTML = quotes.map((x) => `<div class="quote" data-id="${x.id}">${x.proposition ? `<div class="prop">${esc(x.proposition)}</div>` : ''}“${esc(x.text.slice(0, 220))}${x.text.length > 220 ? '…' : ''}” <span class="cite-line">${esc(x.short)}</span></div>`).join('') || '<p class="muted small">No quotes match. Save quotes from the Research view.</p>';
    box.querySelectorAll('.quote').forEach((el) => { const x = quotes.find((y) => y.id === el.dataset.id); draggableCite(el, { kind: 'law', case_id: x.case_id, quote_id: x.id, text: x.text, cite: x.short, note: x.note }); el.addEventListener('dblclick', () => insertAt(citeToken({ kind: 'law', case_id: x.case_id, quote_id: x.id, text: x.text, cite: x.short, note: x.note }), null)); });
  } else if (ds.tab === 'record') {
    const cites = await api(`/v1/record/cites${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    box.innerHTML = cites.map((c, i) => `<div class="quote" data-i="${i}">“${esc(c.text.slice(0, 220))}” <span class="cite-line">${esc(c.cite)}</span></div>`).join('') || '<p class="muted small">No record passages match.</p>';
    box.querySelectorAll('.quote').forEach((el) => { const c = cites[Number(el.dataset.i)]; draggableCite(el, { kind: 'record', pointer: c.pointer, text: c.text, cite: c.cite }); el.addEventListener('dblclick', () => insertAt(citeToken({ kind: 'record', pointer: c.pointer, text: c.text, cite: c.cite }), null)); });
  } else {
    if (!q) { box.innerHTML = '<p class="muted small">Type a question above to search the research database.</p>'; return; }
    const s = await api('/v1/research/search', { body: { query: q, external: false } });
    box.innerHTML = s.results.map((r, i) => `<div class="quote" data-i="${i}"><div class="prop">${esc(r.short_name)}</div>“${esc(r.passage.slice(0, 220))}” <span class="cite-line">${esc(r.short_cite)}</span></div>`).join('') || '<p class="muted small">Nothing matched.</p>';
    box.querySelectorAll('.quote').forEach((el) => { const r = s.results[Number(el.dataset.i)]; draggableCite(el, { kind: 'law', case_id: r.case_id, text: r.passage, cite: r.short_cite }); });
  }
}
let filterTimer = null;
$('d-filter').addEventListener('input', () => { clearTimeout(filterTimer); filterTimer = setTimeout(renderSide, 300); });
document.querySelectorAll('[data-dtab]').forEach((b) => b.addEventListener('click', () => { ds.tab = b.dataset.dtab; document.querySelectorAll('[data-dtab]').forEach((x) => x.classList.toggle('on', x === b)); $('d-filter').placeholder = ds.tab === 'search' ? 'Search the research database…' : 'Filter…'; renderSide(); }));

on('view', async (v) => {
  if (v !== 'drafts') return;
  await loadList();
  let last = null; try { last = localStorage.getItem(`meridian.draft.${session.matter}`); } catch {}
  if (!ds.cur && last && ds.list.some((d) => d.id === last)) await openDraft(last);
  renderSide();
});
on('matter', () => { ds.cur = null; $('d-editor-wrap').hidden = true; $('d-empty').hidden = false; });
