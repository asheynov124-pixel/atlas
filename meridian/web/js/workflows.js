/* Workflow creator: gallery, recommendations, builder, AI-guided designer, community. */
import { $, api, esc, session, on, emit, toast, openOverlay, closeOverlay, setView } from './core.js';

const ws = { data: null, tab: 'builtins' };

async function load() {
  if (!session.matter) return;
  ws.data = await api('/v1/workflows');
  const recs = ws.data.recommendations;
  $('wf-recs').hidden = !recs.length;
  $('wf-recs-list').innerHTML = recs.map((r) => `<button class="tag info" data-rec="${esc(r.id)}" title="${esc(r.reason)}">${esc(r.name)} · <span>${esc(r.reason)}</span></button>`).join('');
  $('wf-recs-list').querySelectorAll('[data-rec]').forEach((b) => b.addEventListener('click', () => { const def = findDef(b.dataset.rec); if (def?.builtin) runWorkflow(b.dataset.rec, def.name); else if (def) openBuilder({ ...def, id: undefined, source: 'mine', inspired_by: def.id }, 'Make it yours'); }));
  renderGrid();
}

function findDef(id) {
  const d = ws.data;
  const b = d.builtins.find((x) => x.id === id); if (b) return { ...b, builtin: true };
  return d.mine.find((x) => x.id === id)?.def ?? d.examples.find((x) => x.id === id) ?? d.community.find((x) => x.id === id);
}

const tierOf = (def) => Math.max(0, ...(def.steps ?? []).flatMap((s) => s.tools ?? []).map((t) => ws.data.tools.find((x) => x.name === t)?.tier ?? 0));

function renderGrid() {
  const d = ws.data;
  const items = ws.tab === 'builtins' ? d.builtins.map((b) => ({ id: b.id, name: b.name, description: b.description, category: b.category, builtin: true }))
    : ws.tab === 'mine' ? d.mine.map((w) => ({ ...w.def, id: w.id, uses: w.uses }))
    : ws.tab === 'examples' ? d.examples : d.community;
  $('wf-grid').innerHTML = items.map((w) => {
    const tier = w.builtin ? null : tierOf(w);
    return `<div class="wcard"><h4>${esc(w.name)}</h4><div><span class="tag">${esc(w.category ?? 'other')}</span>${w.builtin ? '<span class="tag ok">built-in</span>' : `<span class="tag">${(w.steps ?? []).length} steps</span>`}${tier >= 3 ? '<span class="tag warn">acts outside · Tier 3</span>' : ''}${w.uses ? `<span class="tag info">used ${w.uses}×</span>` : ''}${w.author && !w.builtin ? `<span class="tag">${esc(w.author)}</span>` : ''}</div><p>${esc(w.description ?? '')}</p><div class="acts">${ws.tab === 'mine' || w.builtin ? `<button class="primary" data-run="${esc(w.id)}">Run in this matter</button>` : ''}${w.builtin ? '' : `<button class="ghost" data-edit="${esc(w.id)}">${ws.tab === 'mine' ? 'Edit' : 'Use as a starting point'}</button>`}${ws.tab === 'mine' ? `<a class="ghost btn" href="/v1/workflows/${esc(w.id)}/export">Export</a><button class="ghost" data-pub="${esc(w.id)}">Share to community</button><button class="ghost danger" data-del="${esc(w.id)}">Delete</button>` : ''}</div></div>`;
  }).join('') || `<p class="muted">${ws.tab === 'mine' ? 'Nothing here yet. Build one, describe one to Meridian, or start from an example.' : ws.tab === 'community' ? `No community workflows. Shared folder: ${esc(d.community_dir)}` : 'Nothing here.'}</p>`;
  $('wf-grid').querySelectorAll('[data-run]').forEach((b) => b.addEventListener('click', () => runWorkflow(b.dataset.run, findDef(b.dataset.run)?.name)));
  $('wf-grid').querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => { const def = findDef(b.dataset.edit); openBuilder(ws.tab === 'mine' ? { ...def, id: b.dataset.edit } : { ...def, id: undefined, source: 'mine', inspired_by: def.id }, ws.tab === 'mine' ? 'Edit workflow' : 'Make it yours'); }));
  $('wf-grid').querySelectorAll('[data-pub]').forEach((b) => b.addEventListener('click', async () => { const r = await api(`/v1/workflows/${b.dataset.pub}/publish`, { body: {} }); toast(`Shared: ${r.file}`, 'ok'); }));
  $('wf-grid').querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => { if (!confirm('Delete this workflow?')) return; await api(`/v1/workflows/${b.dataset.del}`, { method: 'DELETE' }); load(); }));
}
document.querySelectorAll('[data-wtab]').forEach((b) => b.addEventListener('click', () => { ws.tab = b.dataset.wtab; document.querySelectorAll('[data-wtab]').forEach((x) => x.classList.toggle('on', x === b)); renderGrid(); }));

function runWorkflow(id, name) {
  const body = openOverlay(`Run: ${name ?? id}`, `<form class="form" id="run-wf"><label>Goal for this run<textarea id="run-goal" rows="3" required placeholder="e.g. Digest the Okafor deposition and flag inconsistencies with the delivery receipt">${esc(name ?? '')}</textarea></label><button class="primary">Start</button></form>`);
  body.querySelector('#run-wf').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { const r = await api('/v1/ask', { body: { text: $('run-goal').value, delegate: true, template: id } }); closeOverlay(); toast('Started', 'ok'); setView('workspace'); emit('refresh-workspace'); void r; } catch (err) { toast(err.message, 'bad'); }
  });
}

const blankStep = (i) => ({ id: `s${i}`, title: `Step ${i}`, kind: i === 1 ? 'per_document' : 'combine', instructions: '', model: 'balanced', effort: 'medium', tools: [], output: 'list' });

function openBuilder(def, title = 'Build a workflow', explanation = null) {
  const d = JSON.parse(JSON.stringify(def ?? { name: '', description: '', category: 'drafting', input: { kind: 'documents', filter: '' }, steps: [blankStep(1)], rubric: [{ text: '' }], budget_usd: 10, triggers: [] }));
  const tools = ws.data.tools;
  const body = openOverlay(title, '<div class="builder" id="builder"></div>');
  const host = body.querySelector('#builder');
  const draw = () => {
    host.innerHTML = `${explanation ? `<div class="explain"><b>How Meridian designed this</b><ul>${explanation.explanation.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      <div class="form">
        <label>Name<input data-f="name" value="${esc(d.name)}" required></label>
        <label>What it does<textarea data-f="description" rows="2">${esc(d.description)}</textarea></label>
        <div class="row"><label style="flex:1">Category<select data-f="category">${['research', 'drafting', 'review', 'discovery', 'motion practice', 'client', 'other'].map((c) => `<option ${d.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label><label style="flex:1">Works on<select data-f="input.kind"><option value="documents" ${d.input.kind === 'documents' ? 'selected' : ''}>matter documents</option><option value="question" ${d.input.kind === 'question' ? 'selected' : ''}>a question</option></select></label><label style="flex:1">Only documents named<input data-f="input.filter" placeholder="e.g. *depo*" value="${esc(d.input.filter ?? '')}"></label></div>
        <label>Trigger phrases (comma separated, for auto-routing)<input data-f="triggers" value="${esc((d.triggers ?? []).join(', '))}"></label>
      </div>
      <h3 style="margin-top:14px">Steps</h3>
      ${d.steps.map((s, i) => `<div class="stepbox" data-i="${i}"><div class="row"><input data-s="title" value="${esc(s.title)}" aria-label="Step title"><select data-s="kind"><option value="per_document" ${s.kind === 'per_document' ? 'selected' : ''}>once per document, in parallel</option><option value="once" ${s.kind === 'once' ? 'selected' : ''}>once</option><option value="combine" ${s.kind === 'combine' ? 'selected' : ''}>combine earlier steps</option></select><select data-s="output">${['list', 'table', 'memo', 'letter'].map((o) => `<option ${s.output === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
        <div class="form" style="margin-top:6px"><textarea data-s="instructions" placeholder="Instructions, in the words you would give an associate">${esc(s.instructions)}</textarea></div>
        <div class="row small" style="margin-top:6px"><label>Model <select data-s="model">${['fast', 'balanced', 'frontier'].map((m) => `<option ${s.model === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label><label>Effort <select data-s="effort">${['low', 'medium', 'high', 'xhigh'].map((m) => `<option ${s.effort === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label><span class="sp"></span><button class="ghost small" data-up="${i}" ${i === 0 ? 'disabled' : ''}>↑</button><button class="ghost small" data-down="${i}" ${i === d.steps.length - 1 ? 'disabled' : ''}>↓</button><button class="ghost small danger" data-rm="${i}">Remove</button></div>
        <div class="tools-pick" style="margin-top:6px">${tools.filter((t) => t.name !== 'fs.read').map((t) => `<label title="${esc(t.note)}"><input type="checkbox" data-tool="${t.name}" ${s.tools.includes(t.name) ? 'checked' : ''}> ${esc(t.label)} <span class="tag ${t.tier >= 3 ? 'warn' : ''}">Tier ${t.tier}</span></label>`).join('')}</div></div>`).join('')}
      <button class="ghost" id="b-add">+ Add step</button>
      <h3 style="margin-top:14px">Rubric: what the grader checks</h3>
      ${d.rubric.map((r, i) => `<div class="row" style="margin:4px 0"><input style="flex:1" data-r="${i}" value="${esc(r.text)}" placeholder="e.g. Every deficiency cites the response it concerns."><button class="ghost small danger" data-rr="${i}">×</button></div>`).join('')}
      <button class="ghost small" id="b-addr">+ Add criterion</button>
      <div class="row" style="margin-top:14px"><label class="small">Budget per run ($) <input data-f="budget_usd" type="number" min="1" max="200" value="${d.budget_usd}" style="width:90px"></label></div>
      <div id="b-valid" class="small" style="margin:10px 0"></div>
      <div class="row"><button class="primary" id="b-save">Save workflow</button><button class="ghost" id="b-save-run">Save and run</button></div>`;
    host.querySelectorAll('[data-f]').forEach((el) => el.addEventListener('input', () => { const f = el.dataset.f; const v = f === 'budget_usd' ? Number(el.value) : f === 'triggers' ? el.value.split(',').map((x) => x.trim()).filter(Boolean) : el.value; if (f.startsWith('input.')) d.input[f.slice(6)] = v; else d[f] = v; validate(); }));
    host.querySelectorAll('.stepbox').forEach((box) => { const s = d.steps[Number(box.dataset.i)]; box.querySelectorAll('[data-s]').forEach((el) => el.addEventListener('input', () => { s[el.dataset.s] = el.value; validate(); })); box.querySelectorAll('[data-tool]').forEach((el) => el.addEventListener('change', () => { s.tools = el.checked ? [...new Set([...s.tools, el.dataset.tool])] : s.tools.filter((t) => t !== el.dataset.tool); validate(); })); });
    host.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { d.steps.splice(Number(b.dataset.rm), 1); draw(); }));
    host.querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', () => { const i = Number(b.dataset.up); [d.steps[i - 1], d.steps[i]] = [d.steps[i], d.steps[i - 1]]; draw(); }));
    host.querySelectorAll('[data-down]').forEach((b) => b.addEventListener('click', () => { const i = Number(b.dataset.down); [d.steps[i + 1], d.steps[i]] = [d.steps[i], d.steps[i + 1]]; draw(); }));
    host.querySelector('#b-add').addEventListener('click', () => { d.steps.push(blankStep(d.steps.length + 1)); draw(); });
    host.querySelectorAll('[data-r]').forEach((el) => el.addEventListener('input', () => { d.rubric[Number(el.dataset.r)].text = el.value; }));
    host.querySelectorAll('[data-rr]').forEach((b) => b.addEventListener('click', () => { d.rubric.splice(Number(b.dataset.rr), 1); draw(); }));
    host.querySelector('#b-addr').addEventListener('click', () => { d.rubric.push({ text: '' }); draw(); });
    host.querySelector('#b-save').addEventListener('click', () => save(false));
    host.querySelector('#b-save-run').addEventListener('click', () => save(true));
    validate();
  };
  let vt = null;
  const validate = () => { clearTimeout(vt); vt = setTimeout(async () => { const r = await api('/v1/workflows/validate', { body: d }); const v = r.validation; host.querySelector('#b-valid').innerHTML = `${v.errors.map((e) => `<div class="error">✗ ${esc(e)}</div>`).join('')}${v.warnings.map((w) => `<div class="tag warn">${esc(w)}</div>`).join(' ')}${v.ok ? `<div class="tag ok">Valid · runs at Tier ${v.tier_ceiling} ceiling</div>` : ''}`; }, 250); };
  const save = async (run) => {
    d.rubric = d.rubric.filter((r) => r.text?.trim());
    const out = d.id ? await api(`/v1/workflows/${d.id}`, { method: 'PUT', body: d }).catch((e) => e.data) : await api('/v1/workflows', { body: d }).catch((e) => e.data);
    if (!out?.workflow) { toast(out?.validation?.errors?.join(' ') ?? 'Could not save', 'bad'); return; }
    toast(`Saved “${out.workflow.def.name}”`, 'ok');
    closeOverlay(); ws.tab = 'mine'; document.querySelectorAll('[data-wtab]').forEach((x) => x.classList.toggle('on', x.dataset.wtab === 'mine'));
    await load();
    if (run) runWorkflow(out.workflow.id, out.workflow.def.name);
  };
  draw();
}

$('wf-solo').addEventListener('click', () => openBuilder(null));
$('wf-inspire').addEventListener('click', () => { ws.tab = 'examples'; document.querySelectorAll('[data-wtab]').forEach((x) => x.classList.toggle('on', x.dataset.wtab === 'examples')); renderGrid(); $('wf-grid').scrollIntoView({ behavior: 'smooth' }); });
$('wf-ai').addEventListener('click', () => {
  const body = openOverlay('Describe the workflow', `<form class="form" id="wf-design"><label>What should it do? Write it the way you would brief an associate.<textarea id="wf-desc" rows="5" placeholder="For every deposition transcript, list each admission about the delivery time with page:line cites, then build a table comparing the witnesses and email it to the partner for review."></textarea></label><button class="primary">Design it</button></form><p class="small muted">${session.live ? 'Claude drafts the design.' : 'Offline designer: reads your description for structure. Live models write richer designs.'} You can edit everything before saving.</p>`);
  body.querySelector('#wf-design').addEventListener('submit', async (e) => { e.preventDefault(); const r = await api('/v1/workflows/design', { body: { description: $('wf-desc').value } }); openBuilder(r.def, 'Review the design', r); });
});

on('view', (v) => { if (v === 'workflows') load(); });
on('matter', () => { if (document.body.dataset.view === 'workflows') load(); });
