/**
 * Search: keyword, natural language (AI-interpreted into editable chips),
 * paste-a-link, and visual search. Results open as feeds or seed paths.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore, activeData } from '../state/store';
import { useUI } from '../state/ui';
import { useTaxonomy } from '../state/taxonomy';
import { useModel } from '../state/selectors';
import { startPath } from '../state/feed';
import { dataSource, remember } from '../data/api';
import { looksLikeUrl } from '../data/links';
import { checkQuery } from '../data/safety';
import type { Performer, ResolvedLink, SearchResults, Studio, Tag, VideoSummary } from '../data/types';
import { ai, type Interpretation } from '../ai';
import { toSearch, withoutChip, isKeywordOnly } from '../ai/interpret';
import { suggestQueries } from '../ai/suggest';
import { mergeFilters } from '../engine/filters';
import { isBlocked } from '../engine/ranking';
import { Chip, EmptyState, ErrorState, GridSkeleton, Segmented } from '../components/common';
import { Thumb, VideoTile } from '../components/Thumb';
import { IconClock, IconExternal, IconLink, IconPlay, IconSearch, IconSparkle, IconTarget, IconX } from '../components/Icons';

type ResultTab = 'clips' | 'performers' | 'studios' | 'tags';

interface State {
  status: 'idle' | 'loading' | 'done' | 'error';
  results?: SearchResults;
  items: VideoSummary[];
  hidden: number;
  error?: string;
  interp?: Interpretation;
  link?: ResolvedLink | null;
}

const PAGE = 30;

export function SearchView() {
  const text = useUI((s) => s.searchText);
  const setText = useUI((s) => s.setSearchText);
  const openSheet = useUI((s) => s.openSheet);
  const tab = useUI((s) => s.tab);
  const d = useStore(activeData);
  const addRecent = useStore((s) => s.addRecentSearch);
  const clearRecent = useStore((s) => s.clearRecentSearches);
  const tx = useTaxonomy((s) => s.tx);
  const model = useModel();
  const [st, setSt] = useState<State>({ status: 'idle', items: [], hidden: 0 });
  const [rtab, setRtab] = useState<ResultTab>('clips');
  const [attempt, setAttempt] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  const suggestions = useMemo(() => (tx ? suggestQueries(model, tx) : []), [model.counts.positive, tx]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = useCallback(
    async (q: string, interpOverride?: Interpretation, append = false) => {
      const id = ++seq.current;
      const query = q.trim();
      if (!query || !tx) {
        setSt({ status: 'idle', items: [], hidden: 0 });
        return;
      }
      setSt((s) => ({ ...s, status: 'loading', error: undefined, link: undefined, ...(append ? {} : { items: [], results: undefined }) }));
      try {
        if (looksLikeUrl(query)) {
          const link = await dataSource().resolveUrl(query);
          if (id !== seq.current) return;
          if (link) remember([link.video]);
          setSt({ status: 'done', items: link ? [link.video] : [], hidden: 0, link });
          return;
        }
        const verdict = checkQuery(query);
        if (!verdict.ok) {
          setSt({ status: 'done', items: [], hidden: 0, results: { items: [], total: 0, tookMs: 0, performers: [], studios: [], tags: [], notice: { kind: 'safety', message: verdict.message } } });
          return;
        }
        const interp = interpOverride ?? (await ai().interpretQuery(query, tx));
        const { query: sq, filters } = toSearch(interp, tx);
        const merged = mergeFilters(d.filters, filters);
        const cursor = append ? st.results?.nextCursor : undefined;
        const res = await dataSource().search(sq, merged, { limit: PAGE, cursor });
        if (id !== seq.current) return;
        remember(res.items.map((i) => i.video));
        const visible = res.items.map((i) => i.video).filter((v) => !isBlocked(v, d.blocks));
        setSt((s) => ({
          status: 'done',
          results: res,
          items: append ? [...s.items, ...visible] : visible,
          hidden: (append ? s.hidden : 0) + (res.items.length - visible.length),
          interp,
        }));
      } catch (e) {
        if (id !== seq.current) return;
        setSt((s) => ({ ...s, status: 'error', error: (e as Error).message }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tx, d.filters, d.blocks, st.results?.nextCursor],
  );

  // Debounced live search as you type.
  useEffect(() => {
    if (tab !== 'search') return;
    const t = setTimeout(() => void run(text), 280);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, attempt, tab]);

  useEffect(() => {
    if (tab === 'search' && !text) inputRef.current?.focus({ preventScroll: true });
  }, [tab, text]);

  const submit = (q = text) => {
    const v = q.trim();
    if (!v) return;
    if (!looksLikeUrl(v) && checkQuery(v).ok) addRecent(v);
    if (q !== text) setText(q);
    inputRef.current?.blur();
  };

  const pasteLink = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) {
        setText(t.trim());
        submit(t.trim());
      }
    } catch {
      useUI.getState().toast({ text: 'Clipboard not available — paste into the search box', tone: 'info' });
    }
  };

  const playResults = (startAt?: VideoSummary) => {
    if (!st.interp || !tx) return;
    const { query, filters } = toSearch(st.interp, tx);
    const label = `“${text.trim().slice(0, 28)}”`;
    if (text.trim()) addRecent(text.trim());
    useStore.getState().rememberContent(st.items);
    startPath({ kind: 'search', query, filters, label }, { startWith: startAt ? [startAt.id] : st.items.slice(0, 1).map((v) => v.id), show: true, label });
  };

  const removeChip = (chipId: string) => {
    if (!st.interp) return;
    const next = withoutChip(st.interp, chipId);
    void run(text, next);
  };

  const entities = st.results;
  const hasEntities = !!entities && (entities.performers.length + entities.studios.length + entities.tags.length > 0);

  return (
    <div className="page search">
      <form
        className="searchbar"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <IconSearch size={18} />
        <input
          ref={inputRef}
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search, describe, or paste a link"
          aria-label="Search"
          enterKeyHint="search"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {text && (
          <button type="button" className="icon-btn icon-btn--small" aria-label="Clear search" onClick={() => setText('')}>
            <IconX size={16} />
          </button>
        )}
        <button type="button" className="icon-btn icon-btn--small" aria-label="Visual search" onClick={() => openSheet({ kind: 'visual-search' })}>
          <IconTarget size={18} />
        </button>
      </form>

      {!text.trim() && (
        <div className="search__home">
          <div className="row">
            <button className="btn" onClick={pasteLink}>
              <IconLink size={16} /> Paste link
            </button>
            <button className="btn" onClick={() => openSheet({ kind: 'visual-search' })}>
              <IconTarget size={16} /> Visual search
            </button>
          </div>
          {d.recentSearches.length > 0 && (
            <section className="section">
              <header className="section__head">
                <h2>
                  <IconClock size={16} /> Recent
                </h2>
                <button className="link" onClick={clearRecent}>
                  Clear
                </button>
              </header>
              <div className="chips">
                {d.recentSearches.map((q) => (
                  <Chip key={q} onClick={() => submit(q)}>
                    {q}
                  </Chip>
                ))}
              </div>
            </section>
          )}
          <section className="section">
            <header className="section__head">
              <h2>
                <IconSparkle size={16} /> {model.counts.positive >= 3 ? 'Suggested for this profile' : 'Try describing it'}
              </h2>
            </header>
            <div className="suggestions">
              {suggestions.map((q) => (
                <button key={q} type="button" className="suggestion" onClick={() => submit(q)}>
                  <IconSparkle size={14} /> {q}
                </button>
              ))}
            </div>
          </section>
          {tx && <Browse tags={tx.tags} studios={tx.studios} performers={tx.performers} onPick={submit} />}
        </div>
      )}

      {text.trim() && (
        <div className="search__results">
          {st.link !== undefined && st.status === 'done' && <LinkResult link={st.link} url={text.trim()} />}

          {st.link === undefined && st.interp && !isKeywordOnly(st.interp) && (
            <div className="interp" aria-live="polite">
              <span className="interp__label">
                <IconSparkle size={14} /> {st.interp.natural ? 'Understood as' : 'Matched'}
                {st.interp.confidence < 0.6 && <em> · partly</em>}
              </span>
              <div className="chips">
                {st.interp.chips.map((c) => (
                  <Chip key={c.id} tone={c.kind === 'exclude' ? 'dislike' : c.kind === 'visual' || c.kind === 'lookalike' ? 'capture' : c.kind === 'text' ? 'muted' : 'accent'} onRemove={() => removeChip(c.id)}>
                    {c.label}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {st.results?.notice && (
            <div className={`notice notice--${st.results.notice.kind}`} role="status">
              {st.results.notice.message}
            </div>
          )}

          {st.link === undefined && hasEntities && (
            <Segmented
              value={rtab}
              onChange={setRtab}
              label="Result type"
              options={[
                { value: 'clips', label: `Clips${st.results ? ` ${st.results.total}` : ''}` },
                ...(entities!.performers.length ? [{ value: 'performers' as const, label: `People ${entities!.performers.length}` }] : []),
                ...(entities!.studios.length ? [{ value: 'studios' as const, label: `Studios ${entities!.studios.length}` }] : []),
                ...(entities!.tags.length ? [{ value: 'tags' as const, label: `Tags ${entities!.tags.length}` }] : []),
              ]}
            />
          )}

          {st.status === 'error' && <ErrorState message={st.error ?? 'Search failed'} onRetry={() => setAttempt((a) => a + 1)} />}
          {st.status === 'loading' && !st.items.length && <GridSkeleton count={6} />}

          {st.link === undefined && (rtab === 'clips' || !hasEntities) && st.status !== 'error' && (
            <>
              {st.items.length > 0 && (
                <div className="row row--split">
                  <span className="muted small">
                    {st.results?.total ?? st.items.length} results{st.results ? ` · ${st.results.tookMs}ms` : ''}
                    {st.hidden > 0 && ` · ${st.hidden} hidden by your blocks`}
                  </span>
                  <button className="btn btn--primary btn--small" onClick={() => playResults()}>
                    <IconPlay size={14} /> Play as feed
                  </button>
                </div>
              )}
              <div className="grid">
                {st.items.map((v) => (
                  <VideoTile key={v.id} video={v} onOpen={() => playResults(v)} onLongPress={() => openSheet({ kind: 'more-like', videoId: v.id })} />
                ))}
              </div>
              {st.status === 'done' && !st.items.length && !st.results?.notice && (
                <EmptyState icon={<IconSearch />} title="No matches" body={st.interp && st.interp.chips.length > 1 ? 'Try removing a chip above, or loosen your filters.' : 'Try a broader description, a performer name, or a tag.'}>
                  {suggestions.slice(0, 3).map((q) => (
                    <button key={q} className="btn btn--small" onClick={() => submit(q)}>
                      {q}
                    </button>
                  ))}
                </EmptyState>
              )}
              {st.results?.nextCursor && (
                <button className="btn btn--block" disabled={st.status === 'loading'} onClick={() => void run(text, st.interp, true)}>
                  {st.status === 'loading' ? 'Loading…' : 'Load more'}
                </button>
              )}
            </>
          )}

          {st.link === undefined && rtab === 'performers' && entities && <PeopleList people={entities.performers} />}
          {st.link === undefined && rtab === 'studios' && entities && <StudioList studios={entities.studios} />}
          {st.link === undefined && rtab === 'tags' && entities && (
            <div className="chips">
              {entities.tags.map((t) => (
                <Chip key={t.id} onClick={() => startPath({ kind: 'tags', tagIds: [t.id] }, { show: true })}>
                  #{t.label}
                </Chip>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LinkResult({ link, url }: { link: ResolvedLink | null; url: string }) {
  if (!link) {
    return <EmptyState icon={<IconLink />} title="Couldn’t read that link" body="Paste a full video URL. Links with a viewkey or /video/<id> resolve best." />;
  }
  const v = link.video;
  return (
    <div className="linkcard">
      <Thumb video={v} width={120} className="linkcard__thumb" />
      <div className="linkcard__body">
        <span className="muted small">
          {link.standIn
            ? `Unknown to the mock catalog — mapped to a stand-in${link.matchedBy !== 'hash' ? ` (read ${link.matchedBy === 'viewkey' ? 'the viewkey' : 'the path id'})` : ''}`
            : `Resolved by ${link.matchedBy === 'viewkey' ? 'viewkey' : link.matchedBy === 'path-id' ? 'path id' : 'link'}`}
        </span>
        <strong>{v.title}</strong>
        <div className="row">
          <button className="btn btn--primary" onClick={() => startPath({ kind: 'related', videoId: v.id }, { startWith: [v.id], show: true, label: `From link · ${v.title.slice(0, 20)}` })}>
            <IconPlay size={14} /> Open in feed
          </button>
          <a className="btn" href={v.originalUrl || url} target="_blank" rel="noopener noreferrer">
            Original <IconExternal />
          </a>
        </div>
      </div>
    </div>
  );
}

function PeopleList({ people }: { people: Performer[] }) {
  return (
    <ul className="entity-list">
      {people.map((p) => (
        <li key={p.id}>
          <button type="button" onClick={() => startPath({ kind: 'performer', performerId: p.id }, { show: true })}>
            <span className="person__dot" style={{ background: `hsl(${(Math.atan2(p.face[1], p.face[0]) * 180) / Math.PI} 70% 62%)` }} />
            <span className="entity-list__name">{p.name}</span>
            <small>
              {p.videoCount} clips · {p.ageBracket} · {p.bodyType}
            </small>
          </button>
        </li>
      ))}
    </ul>
  );
}

function StudioList({ studios }: { studios: Studio[] }) {
  return (
    <ul className="entity-list">
      {studios.map((s) => (
        <li key={s.id}>
          <button type="button" onClick={() => startPath({ kind: 'studio', studioId: s.id }, { show: true })}>
            <span className="entity-list__icon">▣</span>
            <span className="entity-list__name">{s.name}</span>
            <small>
              {s.videoCount} clips · {s.style}
            </small>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Browse({ tags, studios, performers, onPick }: { tags: Tag[]; studios: Studio[]; performers: Performer[]; onPick: (q: string) => void }) {
  const top = [...performers].sort((a, b) => b.videoCount - a.videoCount).slice(0, 10);
  return (
    <>
      <section className="section">
        <header className="section__head">
          <h2>Browse tags</h2>
        </header>
        <div className="chips">
          {tags
            .filter((t) => t.category !== 'production')
            .map((t) => (
              <Chip key={t.id} onClick={() => startPath({ kind: 'tags', tagIds: [t.id] }, { show: true })}>
                #{t.label}
              </Chip>
            ))}
        </div>
      </section>
      <section className="section">
        <header className="section__head">
          <h2>Popular performers</h2>
        </header>
        <div className="chips">
          {top.map((p) => (
            <Chip key={p.id} onClick={() => onPick(p.name)}>
              {p.name}
            </Chip>
          ))}
        </div>
      </section>
      <section className="section">
        <header className="section__head">
          <h2>Studios</h2>
        </header>
        <div className="chips">
          {studios.map((s) => (
            <Chip key={s.id} onClick={() => startPath({ kind: 'studio', studioId: s.id }, { show: true })}>
              {s.name}
            </Chip>
          ))}
        </div>
      </section>
    </>
  );
}
