import { jarvisGreeting } from '../data/lead';
import { HOP_CLOCK } from '../hop/policy';
import { useSession } from '../state/session';

export function LeadPanel() {
  const clock = useSession((s) => s.clock);
  const setClock = useSession((s) => s.setClock);
  const leads = useSession((s) => s.leads);
  const acceptLead = useSession((s) => s.acceptLead);
  const acceptedLeadId = useSession((s) => s.acceptedLeadId);
  const mode = useSession((s) => s.mode);
  const setMode = useSession((s) => s.setMode);
  const activity = useSession((s) => s.activity);

  const moves = leads();

  return (
    <aside className="panel rail">
      <div className="ring" aria-hidden>
        <div className={`ring-core mode-${mode}`}>
          <span className="ring-label">JARVIS</span>
          <span className="ring-depth">
            {clock}
            <small>/{HOP_CLOCK.max}</small>
          </span>
        </div>
      </div>

      <p className="greeting">{jarvisGreeting(clock)}</p>

      <div className="mode-toggles" role="group" aria-label="Mode">
        {(['lead', 'explore', 'build'] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={`mode-btn ${mode === m ? 'active' : ''}`}
            onClick={() => setMode(m)}
          >
            {m}
          </button>
        ))}
      </div>

      <label className="depth-slider">
        <span>
          Watermark · {HOP_CLOCK.unit} {clock}
        </span>
        <input
          type="range"
          min={HOP_CLOCK.min}
          max={HOP_CLOCK.max}
          value={clock}
          onChange={(e) => setClock(Number(e.target.value))}
        />
      </label>

      <section className="lead-stack">
        <h2>Lead moves</h2>
        {moves.map((m) => (
          <article key={m.id} className={`lead-card ${acceptedLeadId === m.id ? 'accepted' : ''}`}>
            <p className="kicker">
              {m.kind} · {m.instrument}
            </p>
            <h3>{m.headline}</h3>
            <p>{m.why}</p>
            <p className="lead-action">{m.action}</p>
            <button type="button" className="btn primary compact" onClick={() => acceptLead(m)}>
              Accept
            </button>
          </article>
        ))}
      </section>

      <section className="activity">
        <h2>Activity</h2>
        <ul>
          {activity.slice(0, 8).map((a) => (
            <li key={a.id} className={`tone-${a.tone}`}>
              <time dateTime={new Date(a.at).toISOString()}>
                {new Date(a.at).toLocaleTimeString('en-US', {
                  timeZone: 'America/New_York',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </time>
              <span>{a.text}</span>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
