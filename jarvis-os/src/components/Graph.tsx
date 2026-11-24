import { useMemo } from 'react';
import { hopStatus } from '../hop/policy';
import { EDGES, NODES } from '../data/corpus';
import { useSession } from '../state/session';

export function Graph() {
  const clock = useSession((s) => s.clock);
  const selectedId = useSession((s) => s.selectedId);
  const requestOpen = useSession((s) => s.requestOpen);
  const mode = useSession((s) => s.mode);

  const visible = useMemo(
    () => NODES.filter((n) => hopStatus(n, clock) !== 'unborn'),
    [clock],
  );
  const visibleIds = useMemo(() => new Set(visible.map((n) => n.id)), [visible]);
  const edges = useMemo(
    () => EDGES.filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to)),
    [visibleIds],
  );

  return (
    <section className={`graph-stage mode-${mode}`} aria-label="Knowledge graph">
      <div className="graph-atmosphere" aria-hidden />
      <svg className="graph-svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        {edges.map((e) => {
          const a = NODES.find((n) => n.id === e.from)!;
          const b = NODES.find((n) => n.id === e.to)!;
          return (
            <g key={e.id} className="edge">
              <title>{e.label}</title>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
            </g>
          );
        })}
        {visible.map((n) => {
          const status = hopStatus(n, clock);
          return (
            <g
              key={n.id}
              className={`vertex kind-${n.kind} status-${status} ${selectedId === n.id ? 'selected' : ''}`}
              transform={`translate(${n.x} ${n.y})`}
              onClick={() => requestOpen(n.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault();
                  requestOpen(n.id);
                }
              }}
            >
              <circle r={n.kind === 'build' ? 2.8 : 2.4} />
              <text y={5.2} textAnchor="middle">
                {n.title}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="graph-caption">
        Center graph · unborn names hidden · sealed nodes ask before opening
      </p>
    </section>
  );
}
