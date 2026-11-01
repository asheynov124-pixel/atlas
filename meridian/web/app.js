/* Meridian Canvas Workspace — vanilla JS client for the kernel API. */
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => `$${Number(n || 0).toFixed(2)}`;
  const api = async (path, opts = {}) => {
    const r = await fetch(path, { headers: { 'content-type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || r.statusText);
    return j;
  };
  const toast = (text, kind = '') => { const box = $('toasts'); while (box.children.length >= 3) box.firstChild.remove(); const t = document.createElement('div'); t.className = `toast ${kind}`; t.textContent = text; box.appendChild(t); setTimeout(() => t.remove(), 3500); };

  const state = { ws: null, runs: [], approvals: [], memory: null, conversation: [], templates: [], files: [], selected: null, detail: null, pinned: new Set(), openApproval: null };
  try { state.selected = localStorage.getItem('meridian.selected') || null; } catch {}

  // ---------- bootstrap + live updates ----------
  async function loadState() {
    const s = await api('/v1/state');
    Object.assign(state, { ws: s.workspace, runs: s.runs, approvals: s.approvals, memory: s.memory, conversation: s.conversation, templates: s.templates, files: s.files });
    if (state.selected && !state.runs.some((r) => r.run_id === state.selected)) state.selected = null;
    renderHeader(); renderRuns(); renderConversation(); renderApprovals(); renderMemory(); renderEmpty();
    if (state.selected) await loadDetail(state.selected); else renderCanvas();
  }
  async function loadDetail(run_id) {
    try { state.detail = await api(`/v1/runs/${run_id}`); } catch (e) { state.detail = null; }
    renderCanvas(); renderSwarm();
  }
  let refreshTimer = null;
  function scheduleRefresh() { clearTimeout(refreshTimer); refreshTimer = setTimeout(async () => { try { await loadState(); } catch (e) { console.error(e); } }, 250); }
  function connectEvents() {
    const es = new EventSource('/v1/events');
    const important = { 'approval.requested': (e) => toast(`Approval needed: ${e.payload.action} → ${JSON.stringify(e.payload.target)}`, 'bad'), 'run.completed': () => toast('Run completed', 'ok'), 'run.failed': (e) => toast(`Run failed: ${e.payload.reason}`, 'bad'), 'policy.blocked': (e) => toast(`Blocked by ${e.payload.rule_id}: ${e.payload.tool}`, 'bad'), 'sentinel.alert': (e) => toast(`Sentinel: ${e.payload.kind}`, 'bad'), 'memory.quarantined': (e) => toast(`Quarantined claim: ${e.payload.entity} / ${e.payload.attribute}`), 'run.paused': () => toast('Run paused: waiting on you') };
    es.onmessage = () => {};
    for (const ev of ['hello', 'plan.ready', 'plan.approved', 'task.started', 'task.progress', 'task.completed', 'task.blocked', 'grader.result', 'approval.requested', 'approval.decided', 'approval.expired', 'approval.invalidated', 'policy.blocked', 'policy.question', 'run.completed', 'run.failed', 'run.paused', 'memory.quarantined', 'sentinel.alert', 'compaction.boundary']) {
      es.addEventListener(ev, (m) => { try { const e = JSON.parse(m.data); if (important[ev]) important[ev](e); } catch {} scheduleRefresh(); });
    }
    es.onerror = () => { es.close(); setTimeout(connectEvents, 3000); };
  }

  // ---------- header ----------
  function renderHeader() {
    $('ws-label').textContent = state.ws.label;
    $('provider').textContent = state.ws.provider; $('provider').classList.toggle('live', /live/i.test(state.ws.provider));
    $('user').textContent = state.ws.reviewer.id;
    const n = state.approvals.length; $('bell-count').textContent = n; $('bell-count').hidden = n === 0;
    const sel = $('template'); const cur = sel.value; sel.innerHTML = '<option value="">auto</option>' + state.templates.map((t) => `<option value="${esc(t.name)}" title="${esc(t.description)}">${esc(t.name)}</option>`).join(''); sel.value = cur;
  }

  // ---------- runs ----------
  function renderRuns() {
    const ul = $('runs');
    if (!state.runs.length) { ul.innerHTML = '<li class="muted small" style="display:block">No runs yet. Delegate something.</li>'; return; }
    ul.innerHTML = state.runs.map((r) => `<li data-run="${r.run_id}" class="${r.run_id === state.selected ? 'on' : ''}">
      <span class="dot ${r.status}"></span>
      <div><div class="goal">${esc(r.goal)}</div><div class="meta">${esc(r.status.replace(/_/g, ' '))}${r.pending_approvals ? ` · ${r.pending_approvals} approval` : ''}</div></div>
      <div class="right-meta">${r.percent}%<br>${money(r.spend.usd)}</div></li>`).join('');
    ul.querySelectorAll('li[data-run]').forEach((li) => li.addEventListener('click', () => selectRun(li.dataset.run)));
    const needs = state.runs.filter((r) => r.status === 'paused' || r.status === 'awaiting_plan_approval');
    $('needs-you').hidden = needs.length === 0 && state.approvals.length === 0;
    $('needs-you-list').innerHTML = [...needs.map((r) => `<button class="link" data-run="${r.run_id}">${r.status === 'awaiting_plan_approval' ? 'Approve plan' : 'Resume'}: ${esc(r.goal.slice(0, 60))}</button>`), ...state.approvals.map((a) => `<button class="link" data-appr="${a.approval_id}">Tier 3: ${esc(a.action)} → ${esc(JSON.stringify(a.target))}</button>`)].join('<br>');
    $('needs-you-list').querySelectorAll('[data-run]').forEach((b) => b.addEventListener('click', () => selectRun(b.dataset.run)));
    $('needs-you-list').querySelectorAll('[data-appr]').forEach((b) => b.addEventListener('click', () => { document.body.dataset.tab = 'memory'; setTab('memory'); state.openApproval = b.dataset.appr; renderApprovals(); }));
  }
  async function selectRun(run_id) {
    state.selected = run_id; try { localStorage.setItem('meridian.selected', run_id); } catch {}
    renderRuns(); await loadDetail(run_id); setTab('canvas');
  }

  // ---------- conversation ----------
  function renderConversation() {
    const box = $('messages');
    box.innerHTML = state.conversation.map((m) => {
      const meta = m.meta || {};
      let extra = '';
      if (m.role === 'meridian') {
        const bits = [];
        if (meta.intent) bits.push([meta.intent, meta.effort, meta.tier].filter(Boolean).join(' · '));
        if (meta.timings_ms) bits.push(`${Math.round(Object.values(meta.timings_ms).reduce((a, b) => a + b, 0))} ms routing`);
        if (meta.spans !== undefined) bits.push(`${meta.spans} spans`);
        if (meta.provisional) bits.push(meta.evidence_ok ? 'fast-tier · evidence check passed' : `<span class="flag">fast-tier · ${meta.unsourced?.length ?? 0} unsourced sentence(s), escalate before relying on this</span>`);
        if (m.run_id) bits.push(`<button class="open-run" data-run="${m.run_id}">Open run</button>`);
        extra = `<div class="meta">${bits.join(' · ')}</div>`;
      }
      return `<div class="msg ${m.role}"><div class="who">${m.role === 'user' ? 'You' : 'Meridian'} · ${new Date(m.at).toLocaleTimeString()}</div><div class="body">${linkPointers(esc(m.text))}</div>${extra}</div>`;
    }).join('');
    box.querySelectorAll('.open-run').forEach((b) => b.addEventListener('click', () => selectRun(b.dataset.run)));
    box.querySelectorAll('.prov[data-pointer]').forEach((b) => b.addEventListener('click', () => showPointer(b.dataset.pointer, null)));
    box.scrollTop = box.scrollHeight;
  }
  function linkPointers(html) { return html.replace(/\[\[(ep:[^\]\[]+)\]\]/g, (_, p) => `<button class="prov" data-pointer="${esc(p)}" title="${esc(p)}">src</button>`); }
  async function submit(delegate) {
    const text = $('prompt').value.trim(); if (!text) return;
    $('prompt').value = ''; $('ask').disabled = $('delegate').disabled = true;
    try {
      const r = await api('/v1/ask', { method: 'POST', body: { text, delegate, template: $('template').value || undefined } });
      state.conversation.push(r.user, r.reply); renderConversation();
      if (r.reply.run_id) await selectRun(r.reply.run_id);
      await loadState();
    } catch (e) { toast(e.message, 'bad'); }
    finally { $('ask').disabled = $('delegate').disabled = false; }
  }
  $('composer').addEventListener('submit', (e) => { e.preventDefault(); submit(true); });
  $('ask').addEventListener('click', () => submit(false));
  $('prompt').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(true); } });
  $('new-run').addEventListener('click', () => { setTab('runs'); $('prompt').focus(); });

  // ---------- canvas ----------
  function renderEmpty() {
    const sugg = state.files.length ? ['Review every document in the workspace and build a chronology', 'What is the mediation deadline?', 'Which dates are disputed between the parties?'] : ['Prepare a comparative diligence memo on the 40 companies in list_7', 'What did we decide about the fiscal-year basis for Acme?'];
    if (state.templates.some((t) => t.name === 'diligence') && state.files.length) sugg.push('Prepare a comparative diligence memo on the 40 companies in list_7');
    $('suggestions').innerHTML = sugg.map((s) => `<button>${esc(s)}</button>`).join('');
    $('suggestions').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { $('prompt').value = b.textContent; setTab('runs'); $('prompt').focus(); }));
    $('files').innerHTML = state.files.length ? state.files.map((f) => `<li>${esc(f)}</li>`).join('') : '<li>No documents. Point MERIDIAN_WORKSPACE at a folder of .txt/.md/.eml files.</li>';
  }
  function renderCanvas() {
    const d = state.detail;
    $('canvas-empty').hidden = !!d; $('canvas-run').hidden = !d; $('open-trace').hidden = !d;
    if (!d) return;
    $('run-id').textContent = `${d.run_id} · ${d.topology} · ceiling Tier ${d.risk_tier_ceiling}`;
    $('run-goal').textContent = d.goal;
    $('run-chips').innerHTML = `<span class="chip ${d.status}">${esc(d.status.replace(/_/g, ' '))}</span><span class="chip">${d.ledger.accepted}/${d.ledger.total} tasks</span><span class="chip">${money(d.spend.usd)} / ${money(d.budget.max_usd)}</span>`;
    $('open-trace').onclick = () => window.open(`/v1/runs/${d.run_id}/trace`, '_blank');

    const plan = $('plan-card');
    if (d.status === 'awaiting_plan_approval' && d.plan) {
      plan.hidden = false;
      plan.innerHTML = `<h3>Plan preview · needs your approval before anything mutates</h3><div class="kv"><span>Tasks</span><b>${d.plan.task_count}</b><span>Projected cost</span><b>${money(d.plan.projected_cost_usd)}</b><span>Tier 3 actions anticipated</span><b>${(d.plan.tier3_actions_anticipated || []).join(', ') || 'none'}</b></div><p class="small muted">Approving the plan confirms scope. Each Tier 3 action will still ask for its own approval.</p><div class="row"><button class="primary" id="approve-plan">Approve plan</button><button class="ghost danger" id="reject-plan">Cancel run</button></div>`;
      $('approve-plan').onclick = async () => { await api(`/v1/runs/${d.run_id}/approve-plan`, { method: 'POST', body: {} }); toast('Plan approved; running', 'ok'); loadState(); };
      $('reject-plan').onclick = async () => { await api(`/v1/runs/${d.run_id}/cancel`, { method: 'POST', body: {} }); loadState(); };
    } else plan.hidden = true;

    const qs = $('questions');
    const blocked = d.tasks.filter((t) => t.status === 'blocked');
    const needsAnswer = blocked.filter((t) => d.questions.some((q) => q.task_id === t.task_id && (q.status === 'needs_human' || q.reason === 'grader_disagreement')));
    if (needsAnswer.length) {
      qs.hidden = false;
      qs.innerHTML = `<h3>Meridian has a question (Tier 2)</h3>` + needsAnswer.map((t) => `<div class="small"><b>${esc(t.type)}</b>: ${esc(t.critique || 'ambiguous input; please confirm how to proceed')}</div><form class="inline-form" data-task="${t.task_id}"><input placeholder="Your answer…" required><button class="ghost">Answer</button></form>`).join('');
      qs.querySelectorAll('form').forEach((f) => f.addEventListener('submit', async (e) => { e.preventDefault(); await api(`/v1/runs/${d.run_id}/answer`, { method: 'POST', body: { task_id: f.dataset.task, answer: f.querySelector('input').value } }); loadState(); }));
    } else qs.hidden = true;

    const live = $('progress-live');
    const art = d.artifacts[d.artifacts.length - 1];
    if (!art) {
      live.hidden = false;
      const revising = d.tasks.filter((t) => t.critique);
      live.innerHTML = `<h3>${d.status === 'running' ? 'Working…' : d.status === 'paused' ? 'Paused · waiting on an approval or an answer' : esc(d.status)}</h3><div class="bar"><i style="width:${d.percent}%"></i></div><div class="kv"><span>accepted</span><b>${d.ledger.accepted}</b><span>running</span><b>${d.ledger.running}</b><span>revising</span><b>${d.ledger.revising}</b><span>blocked</span><b>${d.ledger.blocked}</b><span>failed</span><b>${d.ledger.failed}</b></div>${revising.length ? `<p class="small" style="margin:10px 0 0"><b>Grader critiques</b></p>` + revising.slice(0, 5).map((t) => `<div class="critique">${esc(t.type)}: ${esc(t.critique)}</div>`).join('') : ''}`;
      $('artifact').innerHTML = '';
    } else {
      live.hidden = true;
      renderArtifact(art);
    }
    $('prov-card').hidden = true;
  }
  function renderArtifact(art) {
    let html = window.marked ? marked.parse(art.text, { gfm: true, breaks: false }) : `<pre>${esc(art.text)}</pre>`;
    html = html.replace(/⟦(\d+)⟧/g, (_, n) => `<button class="prov" data-marker="${n}" title="Provenance ${n}">${n}</button>`);
    $('artifact').innerHTML = html;
    $('artifact').querySelectorAll('.prov[data-marker]').forEach((b) => b.addEventListener('click', () => {
      const p = (art.provenance || []).find((x) => String(x.marker) === b.dataset.marker);
      $('artifact').querySelectorAll('.prov.on').forEach((x) => x.classList.remove('on')); b.classList.add('on');
      if (p) showPointer(p.pointer, p);
    }));
  }
  async function showPointer(pointer, prov) {
    const card = $('prov-card'); card.hidden = false; card.innerHTML = `<p class="eyebrow">Provenance${prov ? ` ⟦${prov.marker}⟧` : ''}</p><div class="muted small">Resolving…</div>`;
    try {
      const s = await api(`/v1/memory/spans/${encodeURIComponent(pointer)}`);
      const full = esc(s.full); const span = esc(s.text);
      const idx = full.indexOf(span);
      const excerpt = idx >= 0 ? `${full.slice(Math.max(0, idx - 160), idx)}<mark>${span}</mark>${full.slice(idx + span.length, idx + span.length + 160)}` : span;
      card.innerHTML = `<p class="eyebrow">Provenance${prov ? ` ⟦${prov.marker}⟧` : ''}</p>
        <div class="src">${esc(s.source || s.role)} · ${new Date(s.created_at).toLocaleString()} ${s.trusted ? '' : '<span class="untrusted">untrusted content (tool result)</span>'}</div>
        <div class="ptr">${esc(pointer)}</div>
        <blockquote>${excerpt}</blockquote>
        ${prov && prov.quote && !s.text.toLowerCase().includes(prov.quote.toLowerCase().slice(0, 40)) ? `<div class="small muted">Cited quote: “${esc(prov.quote.slice(0, 200))}”</div>` : ''}
        <div class="actions"><button class="ghost" id="open-source">Open full source</button><button class="ghost" id="pin">${state.pinned.has(pointer) ? 'Pinned' : 'Pin'}</button><button class="ghost" id="copy-ptr">Copy pointer</button><button class="ghost" id="close-prov">Close</button></div>`;
      $('open-source').onclick = () => openOverlay(`Source · ${esc(s.source || s.role)}`, `<div class="ptr small muted">${esc(pointer)}</div><pre style="white-space:pre-wrap;font-family:var(--serif);font-size:14.5px;line-height:1.6">${idx >= 0 ? `${full.slice(0, idx)}<mark>${span}</mark>${full.slice(idx + span.length)}` : full}</pre>`);
      $('pin').onclick = () => { state.pinned.add(pointer); $('pin').textContent = 'Pinned'; toast('Pinned to this session'); };
      $('copy-ptr').onclick = async () => { try { await navigator.clipboard.writeText(pointer); toast('Pointer copied'); } catch { toast(pointer); } };
      $('close-prov').onclick = () => { card.hidden = true; };
    } catch (e) { card.innerHTML = `<p class="eyebrow">Provenance</p><div class="alert bad">Pointer does not resolve: ${esc(pointer)}. This is exactly the failure the evidence verifier exists to catch.</div>`; }
  }

  // ---------- swarm ----------
  function renderSwarm() {
    const d = state.detail; const box = $('swarm-body');
    if (!d) { box.innerHTML = '<span class="muted small">Select a run.</span>'; return; }
    const frac = d.budget.max_usd ? d.spend.usd / d.budget.max_usd : 0;
    const pools = {};
    for (const t of d.tasks) { const k = t.type.split('.')[0]; (pools[k] ||= []).push(t); }
    const poolHtml = Object.entries(pools).map(([k, ts]) => `<details class="pool" ${ts.some((t) => t.status === 'running' || t.status === 'revising' || t.status === 'blocked') ? 'open' : ''}><summary><span>${esc(k)}</span><span class="n">${ts.filter((t) => t.status === 'accepted').length}/${ts.length}</span></summary><table class="tasks">${ts.map((t) => `<tr><td title="${esc(t.type)} ${esc(JSON.stringify(t.inputs))}">${esc(t.inputs.company || t.inputs.path || t.inputs.sector || t.type.split('.').slice(1).join('.'))}</td><td class="st ${t.status}">${esc(t.status)}</td><td class="sc">${t.score !== null ? t.score.toFixed(2) : '—'}</td></tr>${t.critique && t.status !== 'accepted' ? `<tr><td colspan="3" class="critique">↻ ${esc(t.critique.slice(0, 160))}</td></tr>` : ''}`).join('')}</table></details>`).join('');
    const alerts = (d.alerts || []).slice(-3).map((a) => `<div class="alert ${/hard|loop/.test(a.kind) ? 'bad' : ''}">${esc(a.kind)}: ${esc(a.detail)}</div>`).join('');
    box.innerHTML = `<div class="kv"><span>${esc(d.status.replace(/_/g, ' '))}</span><b>${d.percent}%</b></div><div class="bar"><i style="width:${d.percent}%"></i></div>
      <div class="kv"><span>${d.ledger.total} tasks</span><b>${d.ledger.accepted} accepted</b><span>running</span><b>${d.ledger.running}</b><span>revising</span><b>${d.ledger.revising}</b><span>blocked</span><b>${d.ledger.blocked}</b><span>failed</span><b>${d.ledger.failed}</b></div>
      ${poolHtml}
      <div class="kv" style="margin-top:10px"><span>Cost</span><b>${money(d.spend.usd)} / ${money(d.budget.max_usd)}</b></div><div class="bar budget ${frac > 0.9 ? 'hot' : frac > 0.7 ? 'warn' : ''}"><i style="width:${Math.min(100, frac * 100)}%"></i></div>
      ${alerts}
      <div class="actions-row">${['running', 'paused', 'awaiting_plan_approval'].includes(d.status) ? `<button class="ghost danger" id="cancel-run">Cancel run</button>` : ''}<button class="ghost" id="hold-run">Litigation hold</button></div>`;
    const c = $('cancel-run'); if (c) c.onclick = async () => { await api(`/v1/runs/${d.run_id}/cancel`, { method: 'POST', body: {} }); loadState(); };
    $('hold-run').onclick = async () => { const reason = window.prompt ? (prompt('Reason for the hold (e.g., preservation notice):') || '') : 'hold'; if (!reason) return; await api('/v1/memory/hold', { method: 'POST', body: { run_id: d.run_id, reason } }); toast('Hold placed on this run'); loadState(); };
  }

  // ---------- approvals ----------
  function renderApprovals() {
    const list = $('approvals-list'); $('approvals-count').textContent = state.approvals.length;
    if (!state.approvals.length) { list.innerHTML = '<span class="muted small">Nothing waiting on you.</span>'; return; }
    list.innerHTML = state.approvals.map((a) => {
      const mins = Math.max(0, Math.round((Date.parse(a.ttl_expires_at) - Date.now()) / 60000));
      const open = state.openApproval === a.approval_id;
      return `<div class="appr" data-id="${a.approval_id}"><div class="t"><span>${esc(a.action)} → ${esc(Array.isArray(a.target) ? a.target.join(', ') : typeof a.target === 'object' ? JSON.stringify(a.target) : a.target)}</span><span class="tier">Tier ${a.tier}</span></div><div class="exp">expires in ${mins} min${a.supersedes ? ' · reissued after state change' : ''}</div>
        ${open ? `<p class="small" style="margin:8px 0 2px"><b>What changes</b> · ${esc(a.diff.kind)}</p><textarea rows="5" id="edit-${a.approval_id}">${esc(a.diff.preview)}</textarea>
          <p class="small" style="margin:8px 0 2px"><b>Evidence (${a.evidence_refs.length})</b></p>${a.evidence_refs.map((e) => `<div class="ev"><button class="prov" data-pointer="${esc(e)}">src</button> ${esc(e)}</div>`).join('') || '<div class="ev muted">none attached</div>'}
          ${a.uncertainty_notes.length ? `<div class="alert">${a.uncertainty_notes.map(esc).join('<br>')}</div>` : ''}
          <p class="state">State snapshot unchanged since ${esc(a.state_snapshot.thread_last_message_at || a.created_at)} ✓</p>
          <p class="small muted">Alternatives: ${a.alternatives.map(esc).join(' · ')}</p>
          <div class="btns"><button class="ghost" data-act="reject">Reject</button><button class="ghost" data-act="edit">Approve with edits</button><button class="primary" data-act="approve">Approve &amp; execute</button></div>` : `<div class="btns"><button class="ghost" data-act="review">Review</button></div>`}</div>`;
    }).join('');
    list.querySelectorAll('.appr').forEach((el) => {
      const id = el.dataset.id;
      el.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
        const act = b.dataset.act;
        if (act === 'review') { state.openApproval = id; await api(`/v1/approvals/${id}/open`, { method: 'POST', body: {} }).catch(() => {}); renderApprovals(); return; }
        try {
          const edited = act === 'edit' ? $(`edit-${id}`).value : undefined;
          const r = await api(`/v1/approvals/${id}/decide`, { method: 'POST', body: { decision: act === 'approve' ? 'approve' : act, edited_preview: edited } });
          if (r.status === 'approved') toast(`Executed: ${r.executed?.text?.slice(0, 80) || 'done'}`, 'ok');
          else if (r.status === 'invalidated') toast('State changed since snapshot; a fresh approval was issued', 'bad');
          else toast(`Approval ${r.status}`);
          state.openApproval = null; loadState();
        } catch (e) { toast(e.message, 'bad'); }
      }));
      el.querySelectorAll('.prov[data-pointer]').forEach((b) => b.addEventListener('click', () => { setTab('canvas'); showPointer(b.dataset.pointer, null); }));
    });
  }
  $('bell').addEventListener('click', () => { setTab('memory'); $('approvals').scrollIntoView({ behavior: 'smooth' }); });

  // ---------- memory ----------
  function renderMemory() {
    const m = state.memory; if (!m) return;
    $('memory-summary').innerHTML = `<div class="mem-kv"><b>${m.claims}</b><span>claims in the semantic graph</span><b>${m.contested}</b><span>contested ⚠</span><b>${m.quarantined}</b><span>quarantined (failed verification)</span><b>${m.episodic_records}</b><span>verbatim records in L2</span></div>${m.holds.map((h) => `<div class="hold">⚖ Hold ${esc(h.id)}: ${esc(h.reason)} (${esc(h.placed_by)})</div>`).join('')}`;
  }
  async function exploreMemory(query = '') {
    const [claims, hits] = await Promise.all([api('/v1/memory/claims'), query ? api('/v1/memory/query', { method: 'POST', body: { query, max_tokens: 1500 } }) : Promise.resolve(null)]);
    const rows = claims.claims.map((c) => `<tr class="${c.status}"><td>${esc(c.entity)}</td><td>${esc(c.attribute)}</td><td>${esc(c.value)}</td><td class="mono">${c.confidence.toFixed(2)}</td><td>${esc(c.status)}${c.contradicted_by.length ? ` · ${c.contradicted_by.length} conflict(s)` : ''}</td><td class="ptr">${c.evidence.map((e) => `<button class="prov" data-pointer="${esc(e.pointer)}">src</button>`).join(' ')}</td><td>${c.status !== 'retired' ? `<button class="link" data-dispute="${c.id}">Dispute</button>` : ''}</td></tr>`).join('');
    const q = claims.quarantine.map((x) => `<div class="q"><b>${esc(x.candidate.entity)} · ${esc(x.candidate.attribute)} = ${esc(x.candidate.value)}</b><br>${esc(x.reason)}</div>`).join('') || '<p class="small muted">Nothing quarantined.</p>';
    const spans = hits ? (hits.spans.map((s) => `<div class="span-hit"><div class="ptr">${esc(s.pointer)} · ${esc(s.source || s.trusted ? 'trusted' : 'untrusted')} · score ${s.score.toFixed(3)}</div>${esc(s.text.slice(0, 400))}</div>`).join('') || '<p class="small muted">No spans matched.</p>') : '';
    openOverlay('Memory explorer', `<form class="inline-form" id="mem-search"><input id="mem-q" placeholder="Search verbatim memory…" value="${esc(query)}"><button class="ghost">Search</button><button class="ghost" type="button" id="export">Export bundle</button><button class="ghost" type="button" id="place-hold">Place workspace hold</button></form>
      ${hits ? `<h3 class="small" style="margin:12px 0 4px">${hits.spans.length} spans · ${hits.packed_tokens}/${hits.budget} tokens packed</h3>${spans}` : ''}
      <h3 class="small" style="margin:16px 0 4px">Claims (${claims.claims.length})</h3><div style="overflow-x:auto"><table class="claims"><thead><tr><th>Entity</th><th>Attribute</th><th>Value</th><th>Conf</th><th>Status</th><th>Evidence</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="muted">No claims yet. Complete a run.</td></tr>'}</tbody></table></div>
      <h3 class="small" style="margin:16px 0 4px">Quarantine (${claims.quarantine.length})</h3>${q}
      <h3 class="small" style="margin:16px 0 4px">Holds</h3>${claims.summary.holds.map((h) => `<div class="hold">⚖ ${esc(h.id)} · ${esc(h.reason)} · ${esc(h.placed_by)} <button class="link" data-release="${h.id}">Release</button></div>`).join('') || '<p class="small muted">No active holds.</p>'}`);
    const body = $('overlay-body');
    $('mem-search').addEventListener('submit', (e) => { e.preventDefault(); exploreMemory($('mem-q').value.trim()); });
    $('export').onclick = () => window.open('/v1/memory/export', '_blank');
    $('place-hold').onclick = async () => { const reason = prompt('Reason for the workspace-wide hold:') || ''; if (!reason) return; await api('/v1/memory/hold', { method: 'POST', body: { reason } }); toast('Hold placed'); exploreMemory(query); loadState(); };
    body.querySelectorAll('[data-dispute]').forEach((b) => b.addEventListener('click', async () => { await api(`/v1/memory/claims/${b.dataset.dispute}/dispute`, { method: 'POST', body: {} }); toast('Claim marked contested; a Reconciler can resolve it'); exploreMemory(query); loadState(); }));
    body.querySelectorAll('[data-release]').forEach((b) => b.addEventListener('click', async () => { await api(`/v1/memory/hold/${b.dataset.release}/release`, { method: 'POST', body: {} }); exploreMemory(query); loadState(); }));
    body.querySelectorAll('.prov[data-pointer]').forEach((b) => b.addEventListener('click', () => { closeOverlay(); setTab('canvas'); showPointer(b.dataset.pointer, null); }));
  }
  $('explore').addEventListener('click', () => exploreMemory());
  $('search-form').addEventListener('submit', (e) => { e.preventDefault(); exploreMemory($('search').value.trim()); });

  // ---------- overlay & tabs ----------
  function openOverlay(title, html) { $('overlay-title').innerHTML = title; $('overlay-body').innerHTML = html; $('overlay').hidden = false; }
  function closeOverlay() { $('overlay').hidden = true; }
  $('overlay-close').addEventListener('click', closeOverlay);
  $('overlay').addEventListener('click', (e) => { if (e.target === $('overlay')) closeOverlay(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeOverlay(); });
  function setTab(name) { document.body.dataset.tab = name; document.querySelectorAll('[data-tab-btn]').forEach((b) => b.classList.toggle('on', b.dataset.tabBtn === name)); }
  document.querySelectorAll('[data-tab-btn]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tabBtn)));

  loadState().then(connectEvents).catch((e) => toast(`Could not reach the API: ${e.message}`, 'bad'));
  setInterval(() => { if (state.approvals.length) renderApprovals(); }, 30000);
})();
