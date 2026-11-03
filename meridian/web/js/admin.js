/* Admin: people and roles, matters, membership, ethical screens, audit trail export. */
import { $, api, esc, session, on, emit, toast, withMatter } from './core.js';

async function load() {
  const role = session.user?.role;
  if (role !== 'admin' && role !== 'partner') return;
  const [users, matters, audit] = await Promise.all([api('/v1/users'), api('/v1/matters/all'), session.matter ? api(withMatter('/v1/audit')).catch(() => null) : null]);
  $('ad-users').innerHTML = `<thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead><tbody>${users.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${role === 'admin' && u.id !== session.user.id ? `<select data-role="${u.id}">${['admin', 'partner', 'associate', 'paralegal'].map((r) => `<option ${u.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select>` : esc(u.role)}</td><td>${u.disabled ? '<span class="tag bad">disabled</span>' : ''}${role === 'admin' && u.id !== session.user.id ? `<button class="link" data-dis="${u.id}" data-v="${u.disabled ? 0 : 1}">${u.disabled ? 'Enable' : 'Disable'}</button>` : ''}</td></tr>`).join('')}</tbody>`;
  $('ad-users').querySelectorAll('[data-role]').forEach((s) => s.addEventListener('change', async () => { await api(`/v1/users/${s.dataset.role}`, { method: 'PATCH', body: { role: s.value } }); toast('Role updated', 'ok'); }));
  $('ad-users').querySelectorAll('[data-dis]').forEach((b) => b.addEventListener('click', async () => { await api(`/v1/users/${b.dataset.dis}`, { method: 'PATCH', body: { disabled: b.dataset.v === '1' } }); load(); }));
  $('ad-user-form').hidden = role !== 'admin';
  $('ad-matters').innerHTML = matters.map((m) => `<div class="mtr"><b>${esc(m.name)}</b> <span class="small muted">${esc(m.client ?? '')} · ${esc(m.docs_dir)}</span>
    <div class="small" style="margin:6px 0">${m.members.map((u) => `<span class="tag ${u.screened ? 'bad' : ''}">${esc(u.name)}${u.screened ? ' · screened' : ''} ${u.screened ? `<button class="link" data-lift="${m.id}|${u.id}">lift</button>` : u.id !== session.user.id ? `<button class="link" data-rm="${m.id}|${u.id}">remove</button>` : ''}</span>`).join('')}</div>
    <div class="row"><select data-add="${m.id}"><option value="">Add a person…</option>${users.filter((u) => !m.members.some((x) => x.id === u.id)).map((u) => `<option value="${u.id}">${esc(u.name)} (${u.role})</option>`).join('')}</select><select data-screen="${m.id}"><option value="">Screen a person…</option>${users.filter((u) => u.id !== session.user.id && !m.members.some((x) => x.id === u.id && x.screened)).map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select></div></div>`).join('');
  $('ad-matters').querySelectorAll('[data-add]').forEach((s) => s.addEventListener('change', async () => { if (!s.value) return; try { await api(`/v1/matters/${s.dataset.add}/members`, { body: { user_id: s.value } }); toast('Added', 'ok'); } catch (e) { toast(e.message, 'bad'); } load(); }));
  $('ad-matters').querySelectorAll('[data-screen]').forEach((s) => s.addEventListener('change', async () => { if (!s.value) return; const reason = prompt('Reason for the ethical screen (recorded in the audit trail):'); if (!reason) { s.value = ''; return; } await api(`/v1/matters/${s.dataset.screen}/screens`, { body: { user_id: s.value, reason } }); toast('Screen placed. That person can no longer open this matter.', 'ok'); load(); }));
  $('ad-matters').querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', async () => { const [m, u] = b.dataset.rm.split('|'); await api(`/v1/matters/${m}/members/${u}`, { method: 'DELETE' }); load(); }));
  $('ad-matters').querySelectorAll('[data-lift]').forEach((b) => b.addEventListener('click', async () => { const [m, u] = b.dataset.lift.split('|'); if (!confirm('Lift this screen? Do this only after a conflicts review.')) return; await api(`/v1/matters/${m}/screens/${u}`, { method: 'DELETE' }); load(); }));
  if (audit) {
    $('ad-chain').innerHTML = audit.chain.ok ? `<span class="tag ok">Hash chain intact · ${audit.chain.rows} entries</span> Each entry is sealed with SHA-256 over the one before it, so an edited or deleted row breaks the chain.` : `<span class="tag bad">Chain broken at entry ${audit.chain.broken_at}</span>`;
    $('ad-jsonl').href = `/v1/audit?format=jsonl&matter=${encodeURIComponent(session.matter)}`;
    $('ad-csv').href = `/v1/audit?format=csv&matter=${encodeURIComponent(session.matter)}`;
    $('ad-firm').hidden = role !== 'admin';
    $('ad-firm').href = '/v1/audit?format=csv';
    $('ad-audit').innerHTML = `<thead><tr><th>#</th><th>When</th><th>Who</th><th>What</th><th>Detail</th></tr></thead><tbody>${audit.rows.slice(-60).reverse().map((r) => `<tr><td>${r.seq}</td><td>${new Date(r.at).toLocaleString()}</td><td>${esc(users.find((u) => u.id === r.actor)?.name ?? r.actor)}</td><td>${esc(r.action)}</td><td class="mono">${esc(r.detail.slice(0, 160))}</td></tr>`).join('')}</tbody>`;
  }
}

$('ad-user-form').addEventListener('submit', async (e) => { e.preventDefault(); try { await api('/v1/users', { body: { name: $('ad-u-name').value, email: $('ad-u-email').value, role: $('ad-u-role').value, password: $('ad-u-pw').value } }); toast('Person added. Share the temporary password privately.', 'ok'); e.target.reset(); load(); } catch (err) { toast(err.message, 'bad'); } });
$('ad-matter-form').addEventListener('submit', async (e) => { e.preventDefault(); try { await api('/v1/matters', { body: { name: $('ad-m-name').value, client: $('ad-m-client').value || undefined, docs_dir: $('ad-m-dir').value || undefined } }); toast('Matter opened', 'ok'); e.target.reset(); emit('matters-changed'); } catch (err) { toast(err.message, 'bad'); } });
on('view', (v) => { if (v === 'admin') load(); });
