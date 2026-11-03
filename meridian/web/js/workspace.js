/* Workspace: runs, conversation, canvas with provenance, swarm, approvals, memory, documents. */
import { $, api, esc, money, prettyDate, session, on, emit, toast, openOverlay, closeOverlay, showPointer, linkPointers, openDoc, withMatter, setView } from './core.js';

const st = { runs: [], approvals: [], memory: null, conversation: [], templates: [], docs: [], deadlines: [], tripwires: [], selected: null, detail: null, openApproval: null, workspace: null };

async function load() {
  if (!session.matter) { renderNoMatter(); return; }
  try {
    const s = await api('/v1/state');
    Object.assign(st, s);
    if (st.selected && !st.runs.some((r) => r.run_id === st.selected)) st.selected = null;
    renderHeader(); renderRuns(); renderConversation(); renderApprovals(); renderMemory(); renderEmpty();
    if (st.selected) await loadDetail(st.selected); else renderCanvas();
    emit('state', st);
  } catch (e) { if (e.status !== 401) toast(e.message, 'bad'); }
}
function renderNoMatter() { $('runs').innerHTML = '<li class="muted small" style="display:block">No matter selected. A partner can open one in Admin.</li>'; }
async function loadDetail(id) { try { st.detail = await api(`/v1/runs/${id}`); } catch { st.detail = null; } renderCanvas(); renderSwarm(); }
let timer = null;
const refresh = () => { clearTimeout(timer); timer = setTimeout(load, 250); };
on('kernel-event', refresh);
on('matter', () => { st.selected = null; st.detail = null; load(); });
on('show-approvals', () => { setTab('memory'); document.querySelector('#approvals-list')?.scrollIntoView({ behavior: 'smooth' }); });
on('refresh-workspace', refresh);

function renderHeader() {
  const n = st.approvals.length;
  $('bell-count').textContent = n; $('bell-count').hidden = n === 0;
  const sel = $('template'); const cur = sel.value;
  sel.innerHTML = '<option value="">auto</option>' + st.templates.map((t) => `<option value="${esc(t.name)}" title="${esc(t.description)}">${esc(t.label)}</option>`).join('');
  sel.value = cur;
  $('matter-title').textContent = st.workspace?.label ?? 'Workspace';
}

function renderRuns() {
  const ul = $('runs');
  ul.innerHTML = st.runs.length ? st.runs.map((r) => `<li data-run="${r.run_id}" class="${r.run_id === st.selected ? 'on' : ''}"><span class="dot ${r.status}"></span><div><div class="goal">${esc(r.goal)}</div><div class="meta">${esc(r.status.replace(/_/g, ' '))}${r.interrupted ? ' · interrupted' : ''}${r.pending_approvals ? ` · ${r.pending_approvals} approval` : ''}</div></div><div class="right-meta">${r.percent}%<br>${money(r.spend.usd)}</div></li>`).join('') : '<li class="muted small" style="display:block">No runs yet. Delegate something.</li>';
  ul.querySelectorAll('li[data-run]').forEach((li) => li.addEventListener('click', () => selectRun(li.dataset.run)));
  const needs = st.runs.filter((r) => r.status === 'paused' || r.status === 'awaiting_plan_approval');
  const items = [
    ...st.tripwires.map((t) => `<div class="trip"><b>Tripwire, ¶${t.paragraph}:</b> ${esc(t.detail?.why ?? '')}. <button class="prov" data-pointer="${esc(t.detail?.pointer ?? '')}">src</button> <span class="cite-line">${esc(t.detail?.cite ?? '')}</span></div>`),
    ...needs.map((r) => `<button class="link" data-run="${r.run_id}">${r.status === 'awaiting_plan_approval' ? 'Approve plan' : r.interrupted ? 'Resume after restart' : 'Waiting on you'}: ${esc(r.goal.slice(0, 60))}</button>`),
    ...st.approvals.map((a) => `<button class="link" data-appr="${a.approval_id}">Tier 3: ${esc(a.action)} → ${esc(targetLabel(a))}</button>`),
  ];
  $('needs-you').hidden = items.length === 0;
  $('needs-you-list').innerHTML = items.join('<br>');
  $('needs-you-list').querySelectorAll('[data-run]').forEach((b) => b.addEventListener('click', () => selectRun(b.dataset.run)));
  $('needs-you-list').querySelectorAll('[data-appr]').forEach((b) => b.addEventListener('click', () => { setTab('memory'); st.openApproval = b.dataset.appr; renderApprovals(); }));
  $('needs-you-list').querySelectorAll('.prov[data-pointer]').forEach((b) => b.addEventListener('click', () => { setTab('canvas'); showPointer(b.dataset.pointer); }));
}
const targetLabel = (a) => (a.action === 'calendar.add_deadline' ? `${a.target.title} · ${prettyDate(a.target.due)}` : Array.isArray(a.target) ? a.target.join(', ') : typeof a.target === 'object' ? JSON.stringify(a.target) : String(a.target));
async function selectRun(id) { st.selected = id; renderRuns(); await loadDetail(id); setTab('canvas'); }

function renderConversation() {
  const box = $('messages');
  box.innerHTML = st.conversation.map((m) => {
    const meta = m.meta ?? {};
    let extra = '';
    if (m.role === 'meridian') {
      const bits = [];
      if (meta.intent) bits.push([meta.intent, meta.effort, meta.tier].filter(Boolean).join(' · '));
      if (meta.spans !== undefined) bits.push(`${meta.spans} spans`);
      if (meta.provisional) bits.push(meta.evidence_ok ? 'fast tier · evidence check passed' : `<span class="flag">fast tier · ${meta.unsourced?.length ?? 0} unsourced sentence(s)</span>`);
      if (meta.cites?.length) bits.push(meta.cites.map((c) => esc(c.cite ?? '')).filter(Boolean).join('; '));
      if (m.run_id) bits.push(`<button class="open-run" data-run="${m.run_id}">Open run</button>`);
      extra = `<div class="meta">${bits.join(' · ')}</div>`;
    }
    return `<div class="msg ${m.role}"><div class="who">${m.role === 'user' ? esc(m.by ?? 'You') : 'Meridian'} · ${new Date(m.at).toLocaleTimeString()}</div><div class="body">${linkPointers(esc(m.text))}</div>${extra}</div>`;
  }).join('');
  box.querySelectorAll('.open-run').forEach((b) => b.addEventListener('click', () => selectRun(b.dataset.run)));
  box.querySelectorAll('.prov[data-pointer]').forEach((b) => b.addEventListener('click', () => { setTab('canvas'); showPointer(b.dataset.pointer); }));
  box.scrollTop = box.scrollHeight;
}
async function submit(delegate) {
  const text = $('prompt').value.trim(); if (!text) return;
  $('prompt').value = ''; $('ask').disabled = $('delegate').disabled = true;
  try { const r = await api('/v1/ask', { body: { text, delegate, template: $('template').value || undefined } }); st.conversation.push(r.user, r.reply); renderConversation(); if (r.reply.run_id) await selectRun(r.reply.run_id); await load(); }
  catch (e) { toast(e.message, 'bad'); }
  finally { $('ask').disabled = $('delegate').disabled = false; }
}
$('composer').addEventListener('submit', (e) => { e.preventDefault(); submit(true); });
$('ask').addEventListener('click', () => submit(false));
$('prompt').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(true); } });
$('new-run').addEventListener('click', () => { setTab('runs'); $('prompt').focus(); });

function renderEmpty() {
  const names = st.docs.map((d) => d.name.toLowerCase()).join(' ');
  const sugg = ['Review every document in the matter and build a sourced chronology'];
  if (/sumf|material facts/.test(names)) sugg.push('Cite-check the statement of material facts', 'Run the opposing counsel simulator on the statement of material facts');
  sugg.push('What is the standard for summary judgment in New Jersey? Write a research memo', 'When is the mediation deadline?');
  $('suggestions').innerHTML = sugg.map((s) => `<button>${esc(s)}</button>`).join('');
  $('suggestions').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { $('prompt').value = b.textContent; setTab('runs'); $('prompt').focus(); }));
  $('docs-count').textContent = st.docs.length ? `${st.docs.length} in this matter` : '';
  $('docs').innerHTML = st.docs.map((d) => `<tr data-doc="${esc(d.id)}"><td>${esc(d.rel)}</td><td>${d.kind === 'pdf' ? `${d.pages} pp.` : `${d.lines} lines`}</td><td>${d.bates_first ? `<span class="tag">${esc(d.bates_first)}–${esc(d.bates_last.replace(/^.*?(\d+)$/, '$1'))}</span>` : ''}${d.scanned_pages.length ? `<span class="tag ${d.ocr_pages.length ? 'ok' : 'warn'}">scan p. ${d.scanned_pages.join(', ')}${d.ocr_pages.length ? ' · OCR' : ' · OCR pending'}</span>` : ''}</td></tr>`).join('') || '<tr><td class="muted">No documents yet.</td></tr>';
  $('docs').querySelectorAll('tr[data-doc]').forEach((tr) => tr.addEventListener('click', async () => openDoc(await api(`/v1/docs/${encodeURIComponent(tr.dataset.doc)}`))));
}

async function upload(files) {
  for (const f of files) {
    try {
      const r = await api(withMatter(`/v1/docs/upload?name=${encodeURIComponent(f.name)}`), { raw: f, headers: { 'content-type': 'application/octet-stream' } });
      const c = r.created[0];
      toast(c ? `Added ${c.name}${c.bates_first ? ` (${c.bates_first})` : ''}${r.deadlines.length ? ` · ${r.deadlines.length} deadline(s) found` : ''}${r.tripwires.length ? ` · ${r.tripwires.length} tripwire(s) tripped` : ''}` : `${f.name} was already in the matter`, r.tripwires.length ? 'bad' : 'ok');
    } catch (e) { toast(`${f.name}: ${e.message}`, 'bad'); }
  }
  load();
}
const dz = $('dropzone');
dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
dz.addEventListener('dragleave', () => dz.classList.remove('over'));
dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('over'); upload([...e.dataTransfer.files]); });
$('pick-files').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', () => { upload([...$('file-input').files]); $('file-input').value = ''; });

function renderCanvas() {
  const d = st.detail;
  $('canvas-empty').hidden = !!d; $('canvas-run').hidden = !d; $('open-trace').hidden = !d;
  if (!d) return;
  $('run-id').textContent = `${d.run_id} · ${d.template ?? d.topology} · ceiling Tier ${d.risk_tier_ceiling}`;
  $('run-goal').textContent = d.goal;
  $('run-chips').innerHTML = `<span class="chip ${d.status}">${esc(d.status.replace(/_/g, ' '))}</span><span class="chip">${d.ledger.accepted}/${d.ledger.total} tasks</span><span class="chip">${money(d.spend.usd)} / ${money(d.budget.max_usd)}</span>`;
  $('open-trace').onclick = () => window.open(withMatter(`/v1/runs/${d.run_id}/trace`), '_blank');
  const plan = $('plan-card');
  if (d.status === 'awaiting_plan_approval' && d.plan) {
    plan.hidden = false;
    plan.innerHTML = `<h3>Plan preview · approve before anything leaves the building</h3><div class="kv"><span>Tasks</span><b>${d.plan.task_count}</b><span>Projected cost</span><b>${money(d.plan.projected_cost_usd)}</b><span>Tier 3 actions anticipated</span><b>${(d.plan.tier3_actions_anticipated || []).join(', ') || 'none'}</b></div><p class="small muted">Approving the plan confirms scope. Each Tier 3 action will still ask a partner for its own approval.</p><div class="row"><button class="primary" id="approve-plan">Approve plan</button><button class="ghost danger" id="reject-plan">Cancel run</button></div>`;
    $('approve-plan').onclick = async () => { await api(`/v1/runs/${d.run_id}/approve-plan`, { body: {} }); toast('Plan approved; running', 'ok'); load(); };
    $('reject-plan').onclick = async () => { await api(`/v1/runs/${d.run_id}/cancel`, { body: {} }); load(); };
  } else plan.hidden = true;
  const qs = $('questions');
  const ask = d.tasks.filter((t) => t.status === 'blocked' && d.questions.some((q) => q.task_id === t.task_id));
  if (ask.length) {
    qs.hidden = false;
    qs.innerHTML = '<h3>Meridian has a question (Tier 2)</h3>' + ask.map((t) => `<div class="small"><b>${esc(t.type)}</b>: ${esc(t.critique || 'ambiguous input; confirm how to proceed')}</div><form class="form inline" data-task="${t.task_id}"><input placeholder="Your answer…" required><button class="ghost">Answer</button></form>`).join('');
    qs.querySelectorAll('form').forEach((f) => f.addEventListener('submit', async (e) => { e.preventDefault(); await api(`/v1/runs/${d.run_id}/answer`, { body: { task_id: f.dataset.task, answer: f.querySelector('input').value } }); load(); }));
  } else qs.hidden = true;
  const live = $('progress-live');
  const art = d.artifacts[d.artifacts.length - 1];
  if (!art) {
    live.hidden = false;
    const crit = d.tasks.filter((t) => t.critique);
    live.innerHTML = `<h3>${d.status === 'running' ? 'Working…' : d.interrupted ? 'Interrupted by a restart' : d.status === 'paused' ? 'Paused · waiting on an approval or an answer' : esc(d.status)}</h3><div class="bar"><i style="width:${d.percent}%"></i></div><div class="kv"><span>accepted</span><b>${d.ledger.accepted}</b><span>running</span><b>${d.ledger.running}</b><span>revising</span><b>${d.ledger.revising}</b><span>blocked</span><b>${d.ledger.blocked}</b><span>failed</span><b>${d.ledger.failed}</b></div>${d.interrupted ? '<div class="row" style="margin-top:10px"><button class="primary" id="resume-run">Resume where it stopped</button></div>' : ''}${crit.length ? '<p class="small" style="margin:10px 0 0"><b>Grader critiques</b></p>' + crit.slice(0, 5).map((t) => `<div class="critique">${esc(t.type)}: ${esc(t.critique)}</div>`).join('') : ''}`;
    const rb = $('resume-run'); if (rb) rb.onclick = async () => { await api(`/v1/runs/${d.run_id}/resume`, { body: {} }); toast('Resuming'); load(); };
    $('artifact').innerHTML = '';
  } else { live.hidden = true; renderArtifact(art); }
  $('prov-card').hidden = true;
}
function renderArtifact(art) {
  let html = window.marked ? marked.parse(art.text, { gfm: true }) : `<pre>${esc(art.text)}</pre>`;
  html = html.replace(/⟦(\d+)⟧/g, (_, n) => { const p = (art.provenance || []).find((x) => String(x.marker) === n); return `<button class="prov" data-marker="${n}" title="${esc(p?.cite ?? '')}">${n}</button>`; });
  $('artifact').innerHTML = html;
  $('artifact').querySelectorAll('.prov[data-marker]').forEach((b) => b.addEventListener('click', () => {
    const p = (art.provenance || []).find((x) => String(x.marker) === b.dataset.marker);
    $('artifact').querySelectorAll('.prov.on').forEach((x) => x.classList.remove('on')); b.classList.add('on');
    if (p) showPointer(p.pointer, { marker: p.marker });
  }));
}

function renderSwarm() {
  const d = st.detail, box = $('swarm-body');
  if (!d) { box.innerHTML = '<span class="muted small">Select a run.</span>'; return; }
  const frac = d.budget.max_usd ? d.spend.usd / d.budget.max_usd : 0;
  const pools = {};
  for (const t of d.tasks) (pools[t.type.split('.')[0]] ||= []).push(t);
  const label = (t) => t.inputs.path || t.inputs.company || (t.inputs.n ? `¶${t.inputs.n}` : '') || t.inputs.case_id || t.type.split('.').slice(1).join('.');
  box.innerHTML = `<div class="kv"><span>${esc(d.status.replace(/_/g, ' '))}</span><b>${d.percent}%</b></div><div class="bar"><i style="width:${d.percent}%"></i></div>
    <div class="kv"><span>${d.ledger.total} tasks</span><b>${d.ledger.accepted} accepted</b><span>running</span><b>${d.ledger.running}</b><span>revising</span><b>${d.ledger.revising}</b><span>blocked</span><b>${d.ledger.blocked}</b><span>failed</span><b>${d.ledger.failed}</b></div>
    ${Object.entries(pools).map(([k, ts]) => `<details class="pool" ${ts.some((t) => ['running', 'revising', 'blocked'].includes(t.status)) ? 'open' : ''}><summary><span>${esc(k)}</span><span class="n">${ts.filter((t) => t.status === 'accepted').length}/${ts.length}</span></summary><table class="tasks">${ts.map((t) => `<tr><td title="${esc(t.type)}">${esc(String(label(t)))}</td><td class="st ${t.status}">${esc(t.status)}</td><td class="sc">${t.score !== null ? t.score.toFixed(2) : '—'}</td></tr>${t.critique && t.status !== 'accepted' ? `<tr><td colspan="3" class="critique">↻ ${esc(t.critique.slice(0, 160))}</td></tr>` : ''}`).join('')}</table></details>`).join('')}
    <div class="kv" style="margin-top:10px"><span>Cost</span><b>${money(d.spend.usd)} / ${money(d.budget.max_usd)}</b></div><div class="bar budget ${frac > 0.9 ? 'hot' : frac > 0.7 ? 'warn' : ''}"><i style="width:${Math.min(100, frac * 100)}%"></i></div>
    ${(d.alerts || []).slice(-3).map((a) => `<div class="alert ${/hard|loop/.test(a.kind) ? 'bad' : ''}">${esc(a.kind)}: ${esc(a.detail)}</div>`).join('')}
    <div class="actions-row">${['running', 'paused', 'awaiting_plan_approval'].includes(d.status) ? '<button class="ghost danger" id="cancel-run">Cancel run</button>' : ''}<button class="ghost" id="hold-run">Litigation hold</button></div>`;
  const c = $('cancel-run'); if (c) c.onclick = async () => { await api(`/v1/runs/${d.run_id}/cancel`, { body: {} }); load(); };
  $('hold-run').onclick = () => holdForm(d.run_id);
}
function holdForm(run_id) {
  const body = openOverlay(run_id ? 'Litigation hold on this run' : 'Litigation hold on the matter', `<form class="form" id="hold-form"><label>Reason<input id="hold-reason" placeholder="Preservation notice dated …" required></label><p class="small muted">A hold freezes retention and Forgetting for everything it covers. Only a partner can release it. Placement is recorded in the audit trail.</p><button class="primary">Place hold</button></form>`);
  body.querySelector('#hold-form').addEventListener('submit', async (e) => { e.preventDefault(); await api('/v1/memory/hold', { body: { ...(run_id ? { run_id } : {}), reason: $('hold-reason').value } }); closeOverlay(); toast('Hold placed', 'ok'); load(); });
}

function renderApprovals() {
  const list = $('approvals-list'); $('approvals-count').textContent = st.approvals.length;
  const canApprove = ['admin', 'partner'].includes(session.user?.role);
  if (!st.approvals.length) { list.innerHTML = '<span class="muted small">Nothing waiting on you.</span>'; return; }
  list.innerHTML = st.approvals.map((a) => {
    const mins = Math.max(0, Math.round((Date.parse(a.ttl_expires_at) - Date.now()) / 60000));
    const open = st.openApproval === a.approval_id;
    const isDeadline = a.action === 'calendar.add_deadline';
    return `<div class="appr" data-id="${a.approval_id}"><div class="t"><span>${isDeadline ? 'Calendar' : esc(a.action)} → ${esc(targetLabel(a))}</span><span class="tier">Tier ${a.tier}</span></div><div class="exp">expires in ${mins >= 120 ? `${Math.round(mins / 60)} h` : `${mins} min`}${a.supersedes ? ' · reissued after state change' : ''}</div>
      ${open ? `<p class="small" style="margin:8px 0 2px"><b>${isDeadline ? 'The math' : 'What changes'}</b></p>${isDeadline ? `<div class="diff">${esc(a.diff.preview)}</div>` : `<textarea rows="6" id="edit-${a.approval_id}">${esc(a.diff.preview)}</textarea>`}
        <p class="small" style="margin:8px 0 2px"><b>Evidence (${a.evidence_refs.length})</b></p>${a.evidence_refs.map((e) => `<div class="ev"><button class="prov" data-pointer="${esc(e)}">src</button> ${esc(e)}</div>`).join('') || '<div class="ev muted">none attached</div>'}
        ${a.uncertainty_notes.length ? `<div class="alert">${a.uncertainty_notes.map(esc).join('<br>')}</div>` : ''}
        ${canApprove ? `<div class="btns"><button class="ghost" data-act="reject">Reject</button>${isDeadline ? '' : '<button class="ghost" data-act="edit">Approve with edits</button>'}<button class="primary" data-act="approve">${isDeadline ? 'Approve & calendar' : 'Approve & execute'}</button></div>` : '<p class="small muted">Only a partner can approve this. Ask a partner, or ask one to delegate approval to you.</p>'}` : '<div class="btns"><button class="ghost" data-act="review">Review</button></div>'}</div>`;
  }).join('');
  list.querySelectorAll('.appr').forEach((el) => {
    const id = el.dataset.id;
    el.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
      const act = b.dataset.act;
      if (act === 'review') { st.openApproval = id; await api(`/v1/approvals/${id}/open`, { body: {} }).catch(() => {}); renderApprovals(); return; }
      try {
        const r = await api(`/v1/approvals/${id}/decide`, { body: { decision: act, edited_preview: act === 'edit' ? $(`edit-${id}`).value : undefined } });
        toast(r.status === 'approved' ? (r.executed?.text?.slice(0, 120) ?? 'Done') : r.status === 'invalidated' ? 'State changed since the snapshot; a fresh approval was issued' : `Approval ${r.status}`, r.status === 'approved' ? 'ok' : r.status === 'invalidated' ? 'bad' : '');
        st.openApproval = null; load();
      } catch (e) { toast(e.message, 'bad'); }
    }));
    el.querySelectorAll('.prov[data-pointer]').forEach((b) => b.addEventListener('click', () => { setTab('canvas'); showPointer(b.dataset.pointer); }));
  });
}

function renderMemory() {
  const m = st.memory; if (!m) return;
  $('memory-summary').innerHTML = `<div class="mem-kv"><b>${m.claims}</b><span>claims in the semantic graph</span><b>${m.contested}</b><span>contested</span><b>${m.quarantined}</b><span>quarantined (failed verification)</span><b>${m.episodic_records}</b><span>verbatim records</span></div>${m.holds.map((h) => `<div class="hold">⚖ ${esc(h.reason)} · ${esc(h.placed_by)}</div>`).join('')}<div class="actions-row"><button class="ghost" id="hold-matter">Hold this matter</button><a class="ghost btn" href="${withMatter('/v1/memory/export')}">Export memory</a></div>`;
  $('hold-matter').onclick = () => holdForm(null);
}
async function exploreMemory(query = '') {
  const [claims, hits] = await Promise.all([api('/v1/memory/claims'), query ? api('/v1/memory/query', { body: { query, max_tokens: 1500 } }) : Promise.resolve(null)]);
  const rows = claims.claims.map((c) => `<tr class="${c.status}"><td>${esc(c.attribute)}</td><td>${esc(c.value)}</td><td class="mono">${c.confidence.toFixed(2)}</td><td>${esc(c.status)}</td><td>${c.evidence.map((e, i) => `<button class="prov" data-pointer="${esc(e.pointer)}" title="${esc(c.cites?.[i] ?? '')}">src</button>`).join(' ')} <span class="cite-line">${esc(c.cites?.[0] ?? '')}</span></td><td>${c.status !== 'retired' ? `<button class="link" data-dispute="${c.id}">Dispute</button>` : ''}</td></tr>`).join('');
  const body = openOverlay('Memory explorer', `<form class="form inline" id="mem-search"><input id="mem-q" placeholder="Search verbatim memory…" value="${esc(query)}"><button class="ghost">Search</button></form>
    ${hits ? hits.spans.map((s) => `<div class="span-hit"><div class="cite-line">${esc(s.cite ?? s.pointer)}</div>${esc(s.text.slice(0, 400))}</div>`).join('') || '<p class="small muted">No spans matched.</p>' : ''}
    <h3 class="small" style="margin:16px 0 4px">Claims (${claims.claims.length})</h3><div style="overflow-x:auto"><table class="claims"><thead><tr><th>Attribute</th><th>Value</th><th>Conf</th><th>Status</th><th>Evidence</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="muted">No claims yet. Complete a review run.</td></tr>'}</tbody></table></div>
    <h3 class="small" style="margin:16px 0 4px">Quarantine (${claims.quarantine.length})</h3>${claims.quarantine.map((x) => `<div class="q"><b>${esc(x.candidate.attribute)} = ${esc(x.candidate.value)}</b><br>${esc(x.reason)}</div>`).join('') || '<p class="small muted">Nothing quarantined.</p>'}`);
  body.querySelector('#mem-search').addEventListener('submit', (e) => { e.preventDefault(); exploreMemory($('mem-q').value.trim()); });
  body.querySelectorAll('[data-dispute]').forEach((b) => b.addEventListener('click', async () => { await api(`/v1/memory/claims/${b.dataset.dispute}/dispute`, { body: {} }); exploreMemory(query); }));
  body.querySelectorAll('.prov[data-pointer]').forEach((b) => b.addEventListener('click', () => { closeOverlay(); setTab('canvas'); showPointer(b.dataset.pointer); }));
}
$('explore').addEventListener('click', () => exploreMemory());

function setTab(name) { document.body.dataset.tab = name; document.querySelectorAll('[data-tab-btn]').forEach((b) => b.classList.toggle('on', b.dataset.tabBtn === name)); }
document.querySelectorAll('[data-tab-btn]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tabBtn)));
on('view', (v) => { if (v === 'workspace') load(); });
setInterval(() => { if (document.body.dataset.view === 'workspace' && st.approvals.length) renderApprovals(); }, 30000);
