/** Search: one box, tag chips to narrow, results as a grid. */
import { useMemo, useState } from 'react';
import { source } from '../data/source';
import { CATALOG } from '../data/mock';
import { duration, plural } from '../lib/format';
import { useUI } from '../state/ui';
import { Empty } from '../ui/common';
import { IconSearch } from '../ui/Icons';
import { Tile } from '../ui/Tile';
import { FOR_YOU } from '../feed/feeds';

export function SearchView() {
  const [q, setQ] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const results = useMemo(() => source.search(q, tags), [q, tags]);
  const toggle = (t: string) => setTags((xs) => (xs.includes(t) ? xs.filter((x) => x !== t) : [...xs, t]));
  const open = (id: string) => {
    const u = useUI.getState();
    u.setFeed(FOR_YOU.id);
    u.setPosition(FOR_YOU.id, Math.max(0, CATALOG.findIndex((c) => c.id === id)));
    u.setTab('feed');
  };
  return (
    <div className="page">
      <div className="page__head">
        <h1>Search</h1>
      </div>
      <label className="visually-hidden" htmlFor="search-q">
        Search cards
      </label>
      <input id="search-q" type="search" placeholder="Titles, creators, tags" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      <div className="chips" aria-label="Filter by tag">
        {source.tags().map((t) => (
          <button key={t} type="button" className={`chip${tags.includes(t) ? ' chip--active' : ''}`} aria-pressed={tags.includes(t)} onClick={() => toggle(t)}>
            <span className="chip__body">#{t}</span>
          </button>
        ))}
      </div>
      {results.length ? (
        <>
          <p className="subhead">{plural(results.length, 'result')}</p>
          <div className="grid">
            {results.map((c) => (
              <Tile key={c.id} card={c} meta={`${c.creator} · ${c.quality} · ${duration(c.seconds)}`} onOpen={() => open(c.id)} />
            ))}
          </div>
        </>
      ) : (
        <Empty
          icon={<IconSearch size={26} />}
          title="Nothing matches"
          body={q ? `No cards match “${q}”${tags.length ? ' with those tags' : ''}.` : 'No cards have all of those tags.'}
          actions={
            <button
              type="button"
              className="btn"
              onClick={() => {
                setQ('');
                setTags([]);
              }}
            >
              Clear search
            </button>
          }
        />
      )}
    </div>
  );
}
