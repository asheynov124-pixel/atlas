/* Deadlines: computed with the math shown, approvals to calendar, ICS, tripwires, calculator. */
import { $, api, esc, session, on, toast, prettyDate, withMatter, showPointer, setView, openOverlay } from './core.js';

let rules = null;

async function load() {
  if (!session.matter) return;
  if (!rules) {
    rules = await api('/v1/deadlines/rules');
    $('dl-rule').innerHTML = rules.rules.map((r) => `<option value="${r.id}">${esc(r.label)} · ${esc(r.cite)}</option>`).join('');
    $('dl-holidays').innerHTML = rules.holidays.map((h) => `<li>${prettyDate(h.date)} · ${esc(h.name)}</li>`).join('');
  }
  const { deadlines, tripwires } = await api('/v1/deadlines');
  $('dl-ics').href = withMatter('/v1/deadlines/calendar.ics');
  $('dl-watch').textContent = 'Docket watch: new files saved into the matter folder are ingested automatically and scanned for triggers.';
  const live = deadlines.filter((d) => d.status !== 'superseded');
  $('dl-table').innerHTML = `<thead><tr><th>Due</th><th>Deadline</th><th>Trigger</th><th>Status</th></tr></thead><tbody>${live.map((d) => `<tr><td class="due">${prettyDate(d.due)}</td><td><b>${esc(d.title)}</b>${d.math.warnings?.length ? d.math.warnings.map((w) => `<div class="small error">⚠ ${esc(w)}</div>`).join('') : ''}<details><summary class="small">Show the math</summary><ol class="math">${d.math.steps.map((s) => `<li>${esc(s.text)}</li>`).join('')}</ol><div class="small muted">Verify: ${esc(d.math.verify)}</div></details></td><td class="small">${esc(d.trigger.label)}${d.trigger.pointer ? ` <button class="prov" data-pointer="${esc(d.trigger.pointer)}">src</button><div class="cite-line">${esc(d.trigger.cite ?? '')}</div>` : ''}</td><td><span class="tag ${d.status === 'calendared' ? 'ok' : d.status === 'rejected' ? 'bad' : 'warn'}">${esc(d.status === 'proposed' ? 'awaiting approval' : d.status)}</span>${d.status === 'proposed' ? '<div><button class="link" data-goto>Review in Approvals</button></div>' : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No deadlines found yet. Upload a filing or scan the documents.</td></tr>'}</tbody>`;
  $('dl-table').querySelectorAll('.prov[data-pointer]').forEach((b) => b.addEventListener('click', () => { const host = document.createElement('aside'); host.className = 'prov-card'; openOverlay('Trigger source', ''); document.getElementById('overlay-body').appendChild(host); showPointer(b.dataset.pointer, { host }); }));
  $('dl-table').querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => { setView('workspace'); }));
  const trips = tripwires.filter((t) => t.status === 'tripped');
  $('dl-trip').hidden = tripwires.length === 0;
  $('dl-trip-list').innerHTML = `<p class="small muted">${tripwires.length} paragraph${tripwires.length === 1 ? '' : 's'} armed by the simulator. A new document that contradicts one trips it.</p>` + trips.map((t) => `<div class="trip"><b>¶${t.paragraph} tripped</b> by ${esc(t.detail?.cite ?? '')}: ${esc(t.detail?.why ?? '')}<blockquote>${esc(t.detail?.sentence ?? '')}</blockquote><div class="small muted">Paragraph: ${esc(t.text)}</div></div>`).join('');
}

function form() { return { rule_id: $('dl-rule').value, date: $('dl-date').value, mail_service: $('dl-mail').checked }; }
function showMath(m) { $('dl-math').innerHTML = `<div class="card" style="margin-top:10px"><b>${esc(m.label)}: ${esc(m.due_pretty)}</b><ol class="math">${m.steps.map((s) => `<li>${esc(s.text)}</li>`).join('')}</ol>${m.warnings.map((w) => `<div class="small error">⚠ ${esc(w)}</div>`).join('')}<div class="small muted">Verify: ${esc(m.verify)}</div></div>`; }
$('dl-form').addEventListener('submit', async (e) => { e.preventDefault(); try { const r = await api('/v1/deadlines/compute', { body: form() }); showMath(r.math); } catch (err) { toast(err.message, 'bad'); } });
$('dl-propose').addEventListener('click', async () => { if (!$('dl-date').value) return toast('Pick a trigger date first.'); const r = await api('/v1/deadlines/compute', { body: { ...form(), propose: true } }); showMath(r.math); toast(r.proposed ? 'Proposed; a partner approves it in Approvals' : 'Already on the list', 'ok'); load(); });
$('dl-scan').addEventListener('click', async () => { const r = await api('/v1/deadlines/scan', { body: {} }); toast(r.proposed.length ? `${r.proposed.length} new deadline(s) found` : 'No new deadlines found'); load(); });
on('view', (v) => { if (v === 'deadlines') load(); });
on('kernel-event', ({ name }) => { if (document.body.dataset.view === 'deadlines' && /deadline|approval|tripwire|doc\./.test(name)) load(); });
