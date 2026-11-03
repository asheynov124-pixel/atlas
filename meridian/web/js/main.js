/* Boot: session, sign-in, matter switcher, views. */
import { $, api, session, on, emit, setView, connectEvents, toast } from './core.js';
import './workspace.js';
import './research.js';
import './drafts.js';
import './workflows.js';
import './deadlines.js';
import './admin.js';

let setupMode = false;

async function boot() {
  let s;
  try { s = await api('/v1/session'); } catch (e) { toast(`Could not reach Meridian: ${e.message}`, 'bad'); return; }
  Object.assign(session, { user: s.user, matters: s.matters, live: s.live, provider: s.provider, courtlistener: s.courtlistener });
  if (!s.user) return showAuth(s.setup_needed);
  $('auth').hidden = true; $('app').hidden = false;
  $('provider').textContent = s.provider; $('provider').classList.toggle('live', s.live);
  $('user').textContent = `${s.user.name} · ${s.user.role}`;
  $('admin-btn').hidden = !(s.user.role === 'admin' || s.user.role === 'partner');
  const sel = $('matter');
  sel.innerHTML = s.matters.map((m) => `<option value="${m.id}">${m.name.replace(/</g, '&lt;')}</option>`).join('') || '<option value="">No matters yet</option>';
  let saved = null; try { saved = localStorage.getItem('meridian.matter'); } catch {}
  session.matter = s.matters.find((m) => m.id === saved)?.id ?? s.matters[0]?.id ?? null;
  sel.value = session.matter ?? '';
  connectEvents();
  let view = 'workspace'; try { view = localStorage.getItem('meridian.view') || 'workspace'; } catch {}
  if (view === 'admin' && $('admin-btn').hidden) view = 'workspace';
  emit('matter', session.matter);
  setView(view);
}

function showAuth(setup) {
  setupMode = setup;
  $('app').hidden = true; $('auth').hidden = false;
  $('auth-name-row').hidden = !setup;
  $('auth-sub').textContent = setup ? 'First run: create the admin account for your firm.' : 'Sign in to your firm.';
  $('auth-submit').textContent = setup ? 'Create admin account' : 'Sign in';
  $('auth-note').textContent = setup ? 'A sample matter (fictional) is created so you can explore every feature. Passwords need 10 or more characters.' : '';
  $('auth-password').autocomplete = setup ? 'new-password' : 'current-password';
  $('auth-email').focus();
}

$('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('auth-error').textContent = '';
  const body = { email: $('auth-email').value, password: $('auth-password').value, ...(setupMode ? { name: $('auth-name').value || $('auth-email').value } : {}) };
  try { await api(setupMode ? '/v1/setup' : '/v1/login', { body }); $('auth-password').value = ''; await boot(); }
  catch (err) { $('auth-error').textContent = err.message; }
});
$('logout').addEventListener('click', async () => { await api('/v1/logout', { body: {} }).catch(() => {}); location.reload(); });
$('matter').addEventListener('change', () => { session.matter = $('matter').value; try { localStorage.setItem('meridian.matter', session.matter); } catch {} connectEvents(); emit('matter', session.matter); });
for (const b of document.querySelectorAll('[data-view-btn]')) b.addEventListener('click', () => setView(b.dataset.viewBtn));
$('bell').addEventListener('click', () => { setView('workspace'); emit('show-approvals'); });
on('signed-out', () => showAuth(false));
on('matters-changed', () => boot());
boot();
