/** Deep filters: full taxonomy, tag logic, weights, presets — per path or profile-wide. */
import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '../Sheet';
import { useUI } from '../../state/ui';
import { useStore, activeData, activePath, BUILTIN_PRESETS } from '../../state/store';
import { useTaxonomy } from '../../state/taxonomy';
import { rebuildAhead } from '../../state/feed';
import { countActive, diffFilters, emptyFilters, mergeFilters, normalizeFilters } from '../../engine/filters';
import type { AgeBracket, BodyType, Filters, HairColor, ProductionStyle, Quality, TagCategory } from '../../data/types';
import { Chip, Segmented } from '../common';
import { haptic } from '../../gestures/haptics';
import { clone } from '../../lib/clone';

type TagMode = 'all' | 'any' | 'none' | 'boost';

const HAIR: HairColor[] = ['black', 'brown', 'blonde', 'red', 'colored'];
const BODY: BodyType[] = ['petite', 'slim', 'athletic', 'curvy', 'muscular'];
const AGE: AgeBracket[] = ['20s', '30s', '40s+'];
const STYLES: ProductionStyle[] = ['amateur', 'pro', 'cinematic'];
const QUALITY: Quality[] = ['SD', 'HD', '4K'];
const CATS: { id: TagCategory; label: string }[] = [
  { id: 'act', label: 'Acts & themes' },
  { id: 'setting', label: 'Setting' },
  { id: 'style', label: 'Visual style' },
  { id: 'mood', label: 'Mood' },
  { id: 'production', label: 'Production' },
];
const BOOST_CYCLE = [0, 1, 2, -1, -2];

const toggle = <T,>(arr: T[], x: T) => (arr.includes(x) ? arr.filter((y) => y !== x) : [...arr, x]);

export function FiltersSheet({ scope: initialScope }: { scope: 'global' | 'path' }) {
  const close = useUI((s) => s.closeSheet);
  const path = useStore(activePath);
  const globalFilters = useStore((s) => activeData(s).filters);
  const presets = useStore((s) => activeData(s).presets);
  const setFilters = useStore((s) => s.setFilters);
  const setPathFilters = useStore((s) => s.setPathFilters);
  const savePreset = useStore((s) => s.savePreset);
  const deletePreset = useStore((s) => s.deletePreset);
  const tx = useTaxonomy((s) => s.tx);
  const [scope, setScope] = useState(initialScope);
  // Path scope edits the *effective* filters (profile + this path) and saves only the difference.
  const effective = (s: 'global' | 'path') => (s === 'global' ? normalizeFilters(globalFilters) : mergeFilters(globalFilters, path.filters));
  const [draft, setDraft] = useState<Filters>(() => effective(initialScope));
  const [tagMode, setTagMode] = useState<TagMode>('all');
  const [presetName, setPresetName] = useState('');
  const [pq, setPq] = useState('');

  const switchScope = (s: 'global' | 'path') => {
    setScope(s);
    setDraft(effective(s));
  };
  const pathDiff = useMemo(() => diffFilters(globalFilters, draft), [globalFilters, draft]);
  const patch = (fn: (f: Filters) => Filters) => setDraft((f) => fn(clone(f)));

  const apply = () => {
    haptic('success');
    if (scope === 'global') {
      setFilters(draft);
      rebuildAhead();
    } else {
      setPathFilters(path.id, Object.keys(pathDiff).length ? pathDiff : undefined);
      rebuildAhead(path.id);
    }
    useUI.getState().toast({ text: `Filters applied${scope === 'path' ? ` to ${path.label}` : ' to all paths'} — upcoming clips re-ranked`, tone: 'info' });
    close();
  };

  const performers = useMemo(() => {
    if (!tx) return [];
    const q = pq.trim().toLowerCase();
    return q ? tx.performers.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8) : [];
  }, [pq, tx]);

  if (!tx) return null;
  const pname = (id: string) => tx.performers.find((p) => p.id === id)?.name ?? id;
  const tagState = (id: string): string | null => {
    if (draft.tags.all.includes(id)) return 'all';
    if (draft.tags.any.includes(id)) return 'any';
    if (draft.tags.none.includes(id)) return 'none';
    const w = draft.tags.weights[id];
    return w ? `w${w}` : null;
  };
  const tapTag = (id: string) => {
    haptic('selection');
    patch((f) => {
      if (tagMode === 'boost') {
        const cur = f.tags.weights[id] ?? 0;
        const next = BOOST_CYCLE[(BOOST_CYCLE.indexOf(cur) + 1) % BOOST_CYCLE.length];
        if (next) f.tags.weights[id] = next;
        else delete f.tags.weights[id];
        return f;
      }
      const lists: ('all' | 'any' | 'none')[] = ['all', 'any', 'none'];
      const wasIn = f.tags[tagMode].includes(id);
      for (const l of lists) f.tags[l] = f.tags[l].filter((x) => x !== id);
      if (!wasIn) f.tags[tagMode].push(id);
      return f;
    });
  };
  const studioState = (id: string) => (draft.studios.include.includes(id) ? 'in' : draft.studios.exclude.includes(id) ? 'out' : null);
  const tapStudio = (id: string) =>
    patch((f) => {
      const st = studioState(id);
      f.studios.include = f.studios.include.filter((x) => x !== id);
      f.studios.exclude = f.studios.exclude.filter((x) => x !== id);
      if (!st) f.studios.include.push(id);
      else if (st === 'in') f.studios.exclude.push(id);
      return f;
    });

  const n = scope === 'path' ? Object.keys(pathDiff).length : countActive(draft);
  return (
    <Sheet
      onClose={close}
      title="Deep filters"
      tall
      footer={
        <div className="row row--split">
          <button className="btn btn--ghost" onClick={() => setDraft(scope === 'path' ? normalizeFilters(globalFilters) : emptyFilters())}>
            {scope === 'path' ? 'Match profile' : 'Reset'}
          </button>
          <button className="btn btn--primary" onClick={apply}>
            Apply{n ? ` (${n}${scope === 'path' ? ` change${n === 1 ? '' : 's'}` : ''})` : ''}
          </button>
        </div>
      }
    >
      <Segmented
        value={scope}
        onChange={switchScope}
        label="Filter scope"
        options={[
          { value: 'path', label: `This path` },
          { value: 'global', label: 'All paths (profile)' },
        ]}
      />
      <p className="muted small">
        {scope === 'path'
          ? `Overrides for “${path.label}”. Anything you don’t change keeps following the profile; profile-wide exclusions always apply.`
          : 'Applies to every path, search, and suggestion in this profile.'}
      </p>

      <div className="fgroup">
        <h3>Presets</h3>
        <div className="chips">
          {[...BUILTIN_PRESETS, ...presets].map((p) => (
            <Chip
              key={p.id}
              onClick={() => setDraft((f) => normalizeFilters({ ...f, ...clone(p.filters) }))}
              onRemove={p.builtIn ? undefined : () => deletePreset(p.id)}
            >
              {p.name}
            </Chip>
          ))}
        </div>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!presetName.trim()) return;
            savePreset(presetName.trim(), draft);
            setPresetName('');
          }}
        >
          <input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Save current as preset…" aria-label="Preset name" />
          <button className="btn" type="submit" disabled={!presetName.trim() || !countActive(draft)}>
            Save
          </button>
        </form>
      </div>

      <div className="fgroup">
        <h3>Performers</h3>
        <input className="search-input" value={pq} onChange={(e) => setPq(e.target.value)} placeholder="Find a performer to include or exclude" aria-label="Find performer" />
        {performers.length > 0 && (
          <ul className="picker">
            {performers.map((p) => (
              <li key={p.id}>
                <span>{p.name}</span>
                <button className="btn btn--small" onClick={() => { patch((f) => ({ ...f, performers: { ...f.performers, include: [...new Set([...f.performers.include, p.id])], exclude: f.performers.exclude.filter((x) => x !== p.id) } })); setPq(''); }}>
                  Only
                </button>
                <button className="btn btn--small btn--danger" onClick={() => { patch((f) => ({ ...f, performers: { ...f.performers, exclude: [...new Set([...f.performers.exclude, p.id])], include: f.performers.include.filter((x) => x !== p.id) } })); setPq(''); }}>
                  Exclude
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="chips">
          {draft.performers.include.map((id) => (
            <Chip key={id} tone="like" onRemove={() => patch((f) => ({ ...f, performers: { ...f.performers, include: f.performers.include.filter((x) => x !== id) } }))}>
              Only {pname(id)}
            </Chip>
          ))}
          {draft.performers.exclude.map((id) => (
            <Chip key={id} tone="dislike" onRemove={() => patch((f) => ({ ...f, performers: { ...f.performers, exclude: f.performers.exclude.filter((x) => x !== id) } }))}>
              No {pname(id)}
            </Chip>
          ))}
        </div>
        <Attr label="Hair" values={HAIR} selected={draft.performers.attrs.hair} onTap={(v) => patch((f) => ((f.performers.attrs.hair = toggle(f.performers.attrs.hair, v)), f))} />
        <Attr label="Body type" values={BODY} selected={draft.performers.attrs.bodyType} onTap={(v) => patch((f) => ((f.performers.attrs.bodyType = toggle(f.performers.attrs.bodyType, v)), f))} />
        <Attr label="Age (all 18+)" values={AGE} selected={draft.performers.attrs.ageBracket} onTap={(v) => patch((f) => ((f.performers.attrs.ageBracket = toggle(f.performers.attrs.ageBracket, v)), f))} />
        <div className="frow">
          <span>Tattoos</span>
          <Segmented value={draft.performers.attrs.tattoos} onChange={(v) => patch((f) => ((f.performers.attrs.tattoos = v), f))} options={[{ value: 'any', label: 'Any' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
        </div>
        <div className="frow">
          <span>Piercings</span>
          <Segmented value={draft.performers.attrs.piercings} onChange={(v) => patch((f) => ((f.performers.attrs.piercings = v), f))} options={[{ value: 'any', label: 'Any' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
        </div>
      </div>

      <div className="fgroup">
        <h3>Tag logic</h3>
        <Segmented
          value={tagMode}
          onChange={setTagMode}
          label="Tag mode"
          options={[
            { value: 'all', label: 'Must have' },
            { value: 'any', label: 'Any of' },
            { value: 'none', label: 'Exclude' },
            { value: 'boost', label: 'Weight' },
          ]}
        />
        <p className="muted small">
          {tagMode === 'boost' ? 'Tap to cycle a soft weight: +1, +2, −1, −2. Weights reorder, they don’t exclude.' : 'Tap tags to add them to this rule. A tag lives in one rule at a time.'}
        </p>
        {CATS.map((c) => (
          <div key={c.id} className="tagcat">
            <span className="tagcat__label">{c.label}</span>
            <div className="chips">
              {tx.tags
                .filter((t) => t.category === c.id)
                .map((t) => {
                  const st = tagState(t.id);
                  const tone = st === 'all' ? 'like' : st === 'any' ? 'accent' : st === 'none' ? 'dislike' : st ? 'save' : undefined;
                  return (
                    <Chip key={t.id} tone={tone} active={!!st} onClick={() => tapTag(t.id)}>
                      {st === 'none' ? '−' : st === 'all' ? '✓ ' : st === 'any' ? '∨ ' : ''}
                      {t.label}
                      {st?.startsWith('w') ? ` ${Number(st.slice(1)) > 0 ? '+' : ''}${st.slice(1)}` : ''}
                    </Chip>
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      <div className="fgroup">
        <h3>Production</h3>
        <span className="tagcat__label">Studios (tap: only → exclude → any)</span>
        <div className="chips">
          {tx.studios.map((s) => {
            const st = studioState(s.id);
            return (
              <Chip key={s.id} tone={st === 'in' ? 'like' : st === 'out' ? 'dislike' : undefined} active={!!st} onClick={() => tapStudio(s.id)}>
                {st === 'out' ? '−' : ''}
                {s.name}
              </Chip>
            );
          })}
        </div>
        <Attr label="Style" values={STYLES} selected={draft.styles} onTap={(v) => patch((f) => ((f.styles = toggle(f.styles, v)), f))} />
        <Attr label="Quality" values={QUALITY} selected={draft.quality} onTap={(v) => patch((f) => ((f.quality = toggle(f.quality, v)), f))} />
        <Range label="Length (min)" min={0} max={60} lo={draft.duration.min} hi={draft.duration.max} onChange={(lo, hi) => patch((f) => ((f.duration = { min: lo, max: hi }), f))} />
        <Range label="Release year" min={2015} max={2026} lo={draft.year.min} hi={draft.year.max} onChange={(lo, hi) => patch((f) => ((f.year = { min: lo, max: hi }), f))} />
      </div>

      <div className="fgroup">
        <h3>Ranking</h3>
        <label className="frow frow--slider">
          <span>Familiar ↔ Discovery</span>
          <input type="range" min={0} max={1} step={0.05} value={draft.exploration} onChange={(e) => patch((f) => ((f.exploration = Number(e.target.value)), f))} />
          <b>{Math.round(draft.exploration * 100)}%</b>
        </label>
        <label className="frow">
          <span>Prefer newer releases</span>
          <input type="checkbox" className="toggle" checked={draft.preferNew} onChange={(e) => patch((f) => ((f.preferNew = e.target.checked), f))} />
        </label>
      </div>
    </Sheet>
  );
}

function Attr<T extends string>({ label, values, selected, onTap }: { label: string; values: T[]; selected: T[]; onTap: (v: T) => void }) {
  return (
    <div className="frow frow--wrap">
      <span>{label}</span>
      <div className="chips">
        {values.map((v) => (
          <Chip key={v} active={selected.includes(v)} tone={selected.includes(v) ? 'accent' : undefined} onClick={() => onTap(v)}>
            {v}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function Range({ label, min, max, lo, hi, onChange }: { label: string; min: number; max: number; lo?: number; hi?: number; onChange: (lo?: number, hi?: number) => void }) {
  // Free typing; clamp only when the field is left, so "2025" can be typed digit by digit.
  const [a, setA] = useState(lo == null ? '' : String(lo));
  const [b, setB] = useState(hi == null ? '' : String(hi));
  useEffect(() => setA(lo == null ? '' : String(lo)), [lo]);
  useEffect(() => setB(hi == null ? '' : String(hi)), [hi]);
  const parse = (s: string) => {
    if (s.trim() === '' || Number.isNaN(Number(s))) return undefined;
    return Math.max(min, Math.min(max, Math.round(Number(s))));
  };
  const commit = () => {
    let x = parse(a);
    let y = parse(b);
    if (x != null && y != null && x > y) [x, y] = [y, x];
    onChange(x, y);
    setA(x == null ? '' : String(x));
    setB(y == null ? '' : String(y));
  };
  return (
    <div className="frow">
      <span>{label}</span>
      <div className="range-pair">
        <input type="text" inputMode="numeric" pattern="[0-9]*" placeholder={String(min)} value={a} onChange={(e) => setA(e.target.value.replace(/[^0-9]/g, ''))} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} aria-label={`${label} minimum`} />
        <span>–</span>
        <input type="text" inputMode="numeric" pattern="[0-9]*" placeholder={String(max)} value={b} onChange={(e) => setB(e.target.value.replace(/[^0-9]/g, ''))} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} aria-label={`${label} maximum`} />
      </div>
    </div>
  );
}
