import { hopStatus } from '../hop/policy';
import { NODES } from '../data/corpus';
import { matchesSearch, useSession } from '../state/session';

export function Inspector() {
  const clock = useSession((s) => s.clock);
  const query = useSession((s) => s.query);
  const setQuery = useSession((s) => s.setQuery);
  const selectedId = useSession((s) => s.selectedId);
  const requestOpen = useSession((s) => s.requestOpen);
  const selected = useSession((s) => s.selected);

  const q = query.trim().toLowerCase();
  const list = NODES.filter((n) => {
    const status = hopStatus(n, clock);
    if (status === 'unborn') return false;
    return matchesSearch(n, q);
  });

  const node = selected();

  return (
    <aside className="panel inspector">
      <header className="panel-head">
        <h1 className="brand">Jarvis</h1>
        <p className="brand-sub">OS Mark I</p>
      </header>

      <label className="search-field">
        <span className="sr-only">Search</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search reached knowledge"
          autoComplete="off"
        />
      </label>

      <ul className="node-list">
        {list.map((n) => {
          const status = hopStatus(n, clock);
          return (
            <li key={n.id}>
              <button
                type="button"
                className={`node-row ${selectedId === n.id ? 'active' : ''} status-${status}`}
                onClick={() => requestOpen(n.id)}
              >
                <span className="node-row-title">{n.title}</span>
                <span className="node-row-meta">
                  {n.kind} · {n.domain}
                  {status !== 'safe' ? ` · ${status}` : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {node && (
        <section className="inspect-detail">
          <p className="kicker">{node.kind} · depth {node.first}–{node.spoil}</p>
          <h2>{node.title}</h2>
          <p>{node.description}</p>
          <p className="lead-copy">{node.lead}</p>
          <ul className="next-moves">
            {node.nextMoves.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
