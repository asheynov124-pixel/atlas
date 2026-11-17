/* Research: agentic search, assistant, opinion viewer with select-to-save, quote bank, library. */
import { $, api, esc, session, on, emit, toast, draggableCite } from './core.js';

const rs = { mode: 'search', last: null, open: null, tab: 'case' };

const renderOpinion = (raw, hs, he) => {
  const part = (s) => esc(s).replace(/\[\*(\d+)\]/g, '<span class="star" title="Reporter page $1">*$1</span>').replace(/\[Excerpt:[^\]]*\]/g, (m) => `<span class="omit">${m.slice(1, -1)}</span>`);
  if (hs === undefined) return part(raw);
  return `${part(raw.slice(0, hs))}<mark id="r-hit">${part(raw.slice(hs, he))}</mark>${part(raw.slice(he))}`;
};

function status() {
  $('r-status').innerHTML = session.courtlistener ? 'Searching your research database and CourtListener.' : 'Searching your research database. Add a free <code>COURTLISTENER_TOKEN</code> to search every published opinion and import full texts.';
}

async function run(e) {
  e?.preventDefault();
  const q = $('r-q').value.trim(); if (!q) return;
  $('r-results').innerHTML = '<p class="muted">Searching…</p>'; $('r-answer').innerHTML = '';
  try {
    if (rs.mode === 'ask') {
      const a = await api('/v1/research/ask', { body: { message: q } });
      $('r-answer').innerHTML = `<div class="answer">${esc(a.answer)}${a.removed.length ? `<p class="small error">Removed ${a.removed.length} quotation(s) that were not verbatim in a source.</p>` : '<p class="small muted">Every quotation above was verified against its source.</p>'}</div>`;
      renderTrace(a.trace); renderResults({ results: a.sources, external: [] }); renderRecs(a.recommendations);
    } else {
      const s = await api('/v1/research/search', { body: { query: q } });
      rs.last = s; renderTrace(s.trace); renderResults(s); renderRecs(s.recommendations);
    }
  } catch (err) { $('r-results').innerHTML = `<p class="error">${esc(err.message)}</p>`; }
}
$('r-form').addEventListener('submit', run);
document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { rs.mode = b.dataset.mode; document.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('on', x === b)); $('r-q').placeholder = rs.mode === 'ask' ? 'Ask the research assistant a question' : 'Ask a legal question, or type a citation like 142 N.J. 520'; }));

function renderTrace(trace) {
  $('r-trace').hidden = !trace?.length;
  $('r-trace-list').innerHTML = (trace ?? []).map((t) => `<li><b>${esc(t.step)}</b> · ${esc(t.detail)}${t.items ? `<div class="items">${t.items.map(esc).join(' · ')}</div>` : ''}</li>`).join('');
}

function renderResults(s) {
  const res = s.results ?? [];
  $('r-results').innerHTML = (res.length ? res.map((r, i) => `<div class="result" data-i="${i}"><h4>${esc(r.name)}</h4><div class="meta">${esc(r.full_cite)}</div><div>${r.why.map((w) => `<span class="tag ${/Binding/.test(w) ? 'ok' : /Excerpt/.test(w) ? 'warn' : /quote/.test(w) ? 'info' : ''}">${esc(w)}</span>`).join('')}</div><blockquote>${esc(r.passage)} <span class="cite-line">${esc(r.short_cite)}</span></blockquote><div class="acts"><button class="ghost" data-a="open">Open opinion</button><button class="ghost" data-a="save">Save quote</button><button class="ghost" data-a="copy">Copy with pin cite</button><button class="ghost" data-a="star">${r.starred ? 'Starred' : 'Star'}</button></div></div>`).join('') : '<p class="muted">No authority in the research database matched. Try different words, import an opinion, or add a CourtListener token.</p>')
    + ((s.external ?? []).length ? `<h3>On CourtListener, not yet in your library</h3>${s.external.map((e) => `<div class="result"><h4>${esc(e.name)}</h4><div class="meta">${esc(e.citation ?? e.court)} · ${esc((e.date ?? '').slice(0, 4))}</div><p class="small">${esc(e.snippet.slice(0, 300))}</p><div class="acts"><button class="ghost" data-import="${e.opinion_id}">Import full opinion</button></div></div>`).join('')}` : '');
  $('r-results').querySelectorAll('.result[data-i]').forEach((el) => {
    const r = res[Number(el.dataset.i)];
    draggableCite(el, { kind: 'law', case_id: r.case_id, text: r.passage, cite: r.short_cite, full_cite: r.full_cite });
    el.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', async () => {
      const a = b.dataset.a;
      if (a === 'open') return openCase(r.case_id, r.start, r.end);
      if (a === 'copy') return copy(`“${r.passage}” ${r.short_cite}.`);
      if (a === 'star') { await api(`/v1/research/cases/${encodeURIComponent(r.case_id)}`, { method: 'PATCH', body: { starred: true } }); b.textContent = 'Starred'; return; }
      if (a === 'save') return saveQuote(r.case_id, r.passage);
    }));
  });
  $('r-results').querySelectorAll('[data-import]').forEach((b) => b.addEventListener('click', () => importCl(Number(b.dataset.import))));
}

function renderRecs(recs) {
  $('r-recs').hidden = !recs?.length;
  $('r-recs-list').innerHTML = (recs ?? []).map((r, i) => `<button class="rec" data-i="${i}"><b>${esc(r.title)}</b><span>${esc(r.detail)}</span></button>`).join('');
  $('r-recs-list').querySelectorAll('.rec').forEach((b) => b.addEventListener('click', async () => {
    const r = recs[Number(b.dataset.i)], a = r.action ?? {};
    if (a.open_case) openCase(a.open_case);
    else if (a.save_quote) { const c = await api(`/v1/research/cases/${encodeURIComponent(a.save_quote.case_id)}`); saveQuote(c.id, c.text.slice(a.save_quote.start, a.save_quote.end)); }
    else if (a.treatment) { openCase(a.treatment); treatment(a.treatment); }
    else if (a.query) { $('r-q').value = a.query; run(); }
    else if (a.import_opinion) importCl(a.import_opinion);
    else if (a.quote_id) setTab('quotes');
  }));
}

async function copy(text) { try { await navigator.clipboard.writeText(text); toast('Copied with pin cite'); } catch { toast(text); } }

async function saveQuote(case_id, text) {
  const proposition = prompt('What does this quote stand for? (one line, optional)') ?? '';
  try { const q = await api('/v1/research/quotes', { body: { case_id, text: text.replace(/\*\d+/g, '').trim(), proposition, matter_id: session.matter } }); toast(`Saved to the quote bank: ${q.short}`, 'ok'); if (rs.tab === 'quotes') renderQuotes(); }
  catch (e) { toast(e.message, 'bad'); }
}

async function openCase(id, hs, he) {
  setTab('case');
  const c = await api(`/v1/research/cases/${encodeURIComponent(id)}`);
  rs.open = c;
  $('rt-case').innerHTML = `<div class="case-head"><p class="eyebrow">${esc(c.court ?? '')}${c.excerpt ? ' · excerpt' : ''}</p><h3>${esc(c.name)}</h3><div class="cite-line">${esc(c.full_cite)}</div>
    <div class="row" style="margin:8px 0"><button class="ghost small" id="c-star">${c.starred ? '★ Starred' : '☆ Star'}</button><button class="ghost small" id="c-treat">Check treatment</button>${c.url ? `<a class="ghost btn small" href="${esc(c.url)}" target="_blank" rel="noopener">Open on CourtListener</a>` : ''}</div>
    <div id="c-treatment" class="small">${c.treatment ? `<span class="tag ${c.treatment.signals.some((s) => s.signal.startsWith('negative')) ? 'bad' : 'ok'}">${esc(c.treatment.summary)}</span>` : ''}</div>
    ${c.cites.filter((x) => x.in_library).length ? `<p class="small">Relies on: ${c.cites.filter((x) => x.in_library).map((x) => `<button class="link" data-open="${esc(x.in_library.id)}">${esc(x.in_library.name)}</button>`).join(', ')}</p>` : ''}
    ${c.cited_by.length ? `<p class="small">Cited by: ${c.cited_by.map((x) => `<button class="link" data-open="${esc(x.id)}">${esc(x.name)}</button>`).join(', ')}</p>` : ''}
    ${c.quotes.length ? `<p class="small">${c.quotes.length} saved quote${c.quotes.length === 1 ? '' : 's'} from this case.</p>` : ''}</div>
    <p class="small muted">Select any passage to save it or copy it with its pin cite. Reporter pages appear as <span class="star">*540</span>.</p>
    <div class="opinion" id="opinion">${renderOpinion(c.text, hs, he)}</div>`;
  document.getElementById('r-hit')?.scrollIntoView({ block: 'center' });
  $('c-star').onclick = async () => { await api(`/v1/research/cases/${encodeURIComponent(c.id)}`, { method: 'PATCH', body: { starred: !c.starred } }); openCase(c.id); };
  $('c-treat').onclick = () => treatment(c.id);
  $('rt-case').querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openCase(b.dataset.open)));
}

async function treatment(id) {
  const t = await api(`/v1/research/cases/${encodeURIComponent(id)}/treatment`, { body: {} });
  const box = document.getElementById('c-treatment');
  if (box) box.innerHTML = `<span class="tag ${t.signals.some((s) => s.signal.startsWith('negative')) ? 'bad' : 'ok'}">${esc(t.summary)}</span><div class="small muted">${esc(t.method)}</div>${t.signals.slice(0, 5).map((s) => `<div class="small">${esc(s.by_name)} · <b>${esc(s.signal)}</b>: ${esc(s.snippet.slice(0, 200))}…</div>`).join('')}`;
}

// Select-to-save inside the opinion viewer.
document.addEventListener('mouseup', (e) => {
  const pop = $('sel-pop');
  if (pop.contains(e.target)) return;
  const sel = window.getSelection();
  const op = document.getElementById('opinion');
  if (!sel || sel.isCollapsed || !op || !op.contains(sel.anchorNode)) { pop.hidden = true; return; }
  const text = sel.toString().replace(/\*\d+/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length < 8) { pop.hidden = true; return; }
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  pop.style.left = `${Math.max(8, Math.min(window.innerWidth - 280, rect.left))}px`;
  pop.style.top = `${Math.max(8, rect.top - 46)}px`;
  pop.hidden = false;
  pop.dataset.text = text;
});
$('sel-save').addEventListener('click', () => { $('sel-pop').hidden = true; if (rs.open) saveQuote(rs.open.id, $('sel-pop').dataset.text); });
$('sel-copy').addEventListener('click', async () => {
  $('sel-pop').hidden = true;
  if (!rs.open) return;
  const v = await api('/v1/research/verify', { body: { case_id: rs.open.id, quote: $('sel-pop').dataset.text } });
  if (!v.ok) return toast('That selection crosses omitted text and cannot be quoted as one passage.', 'bad');
  copy(`“${$('sel-pop').dataset.text}” ${v.short}.`);
});

async function renderQuotes(q = '') {
  const quotes = await api(`/v1/research/quotes${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  $('rt-quotes').innerHTML = `<input id="qb-q" placeholder="Search the quote bank…" value="${esc(q)}" style="width:100%;font:inherit;padding:6px 8px;border:1px solid var(--rule);border-radius:4px;background:var(--bg);color:var(--fg)"><p class="small muted">Every quote here verified word for word against its opinion when it was saved. Drag a card into a draft.</p>`
    + quotes.map((x) => `<div class="quote" data-id="${x.id}">${x.proposition ? `<div class="prop">${esc(x.proposition)}</div>` : ''}<blockquote>“${esc(x.text)}”</blockquote><span class="cite-line">${esc(x.short)}</span>${x.note ? `<div class="meta">(${esc(x.note)})</div>` : ''}<div class="meta">${x.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')} used ${x.uses}×</div><div class="row"><button class="ghost small" data-a="copy">Copy</button><button class="ghost small" data-a="open">Open case</button><button class="ghost small danger" data-a="del">Remove</button></div></div>`).join('');
  $('qb-q').addEventListener('change', () => renderQuotes($('qb-q').value.trim()));
  $('rt-quotes').querySelectorAll('.quote').forEach((el) => {
    const x = quotes.find((y) => y.id === el.dataset.id);
    draggableCite(el, { kind: 'law', case_id: x.case_id, quote_id: x.id, text: x.text, cite: x.short, note: x.note, full_cite: x.cite });
    el.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', async () => {
      if (b.dataset.a === 'copy') { await api(`/v1/research/quotes/${x.id}/use`, { body: {} }); copy(`“${x.text}” ${x.short}${x.note ? ` (${x.note})` : ''}.`); }
      if (b.dataset.a === 'open') { const c = await api(`/v1/research/cases/${encodeURIComponent(x.case_id)}`); openCase(x.case_id, x.start, x.end); void c; }
      if (b.dataset.a === 'del' && confirm('Remove this quote from the bank?')) { await api(`/v1/research/quotes/${x.id}`, { method: 'DELETE' }); renderQuotes(q); }
    }));
  });
}

async function renderLibrary() {
  const cases = await api('/v1/research/cases');
  $('rt-library').innerHTML = `<table class="tbl"><thead><tr><th>Case</th><th>Court</th><th>Quotes</th></tr></thead><tbody>${cases.map((c) => `<tr><td><button class="link" data-open="${esc(c.id)}">${c.starred ? '★ ' : ''}${esc(c.name)}</button><div class="cite-line">${esc(c.citation ?? '')}${c.excerpt ? ' · excerpt' : ''}</div></td><td class="small">${esc(c.court ?? '')}</td><td>${c.quotes}</td></tr>`).join('')}</tbody></table>
    <h3 style="margin-top:16px">Import an opinion</h3>
    ${session.courtlistener ? '<form class="form inline" id="imp-cl"><input id="imp-id" placeholder="CourtListener opinion id, e.g. 2381317" required><button class="primary">Import</button></form>' : '<p class="small muted">Add a free COURTLISTENER_TOKEN to import by opinion id, or paste the text below.</p>'}
    <form class="form" id="imp-manual"><label>Case name<input id="imp-name" required placeholder="Printing Mart-Morristown v. Sharp Elecs. Corp."></label><label>Citation<input id="imp-cite" placeholder="116 N.J. 739"></label><label>Court<input id="imp-court" placeholder="Supreme Court of New Jersey"></label><label>Decided<input id="imp-date" type="date"></label><label>Opinion text (mark reporter pages as [*746] for pin cites)<textarea id="imp-text" rows="6" required></textarea></label><button class="ghost">Add to the library</button></form>`;
  $('rt-library').querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openCase(b.dataset.open)));
  document.getElementById('imp-cl')?.addEventListener('submit', (e) => { e.preventDefault(); importCl(Number($('imp-id').value)); });
  $('imp-manual').addEventListener('submit', async (e) => { e.preventDefault(); try { const c = await api('/v1/research/cases/import', { body: { name: $('imp-name').value, citation: $('imp-cite').value || undefined, court: $('imp-court').value || undefined, date: $('imp-date').value || undefined, text: $('imp-text').value } }); toast(`Imported ${c.name}`, 'ok'); renderLibrary(); } catch (err) { toast(err.message, 'bad'); } });
}

async function importCl(id) { try { const c = await api('/v1/research/cases/import', { body: { courtlistener_id: id } }); toast(`Imported ${c.name}`, 'ok'); openCase(c.id); } catch (e) { toast(e.message, 'bad'); } }

function setTab(t) {
  rs.tab = t;
  document.querySelectorAll('[data-rtab]').forEach((b) => b.classList.toggle('on', b.dataset.rtab === t));
  for (const k of ['case', 'quotes', 'library']) $(`rt-${k}`).hidden = k !== t;
  if (t === 'quotes') renderQuotes();
  if (t === 'library') renderLibrary();
}
document.querySelectorAll('[data-rtab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.rtab)));
on('view', (v) => { if (v === 'research') { status(); if (!$('r-q').value) { $('r-q').value = 'What is the standard for summary judgment in New Jersey?'; } } });
on('open-case', (id) => openCase(id));
void emit;
