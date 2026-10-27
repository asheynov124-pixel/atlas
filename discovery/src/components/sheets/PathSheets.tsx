/** Path switcher, profile switcher, and the Aspect Capture result. */
import { useEffect, useState } from 'react';
import { Sheet, MenuItem } from '../Sheet';
import { useUI } from '../../state/ui';
import { useStore, activeData, activeProfile, PROFILE_COLORS, PROFILE_EMOJI } from '../../state/store';
import { activatePath, currentVideoId, noteCapture, startPath } from '../../state/feed';
import { lookupVideo } from '../../state/selectors';
import { useTaxonomy } from '../../state/taxonomy';
import { PATH_KINDS } from '../../engine/paths';
import { countActive } from '../../engine/filters';
import { ai, type AspectIntent } from '../../ai';
import { useSuggestions } from '../../views/feed/SuggestionBanner';
import { Thumb } from '../Thumb';
import { Chip, Spinner, Toggle } from '../common';
import { IconBranch, IconPencil, IconPlus, IconSparkle, IconTarget, IconTrash } from '../Icons';
import { plural, timeAgo } from '../../lib/format';
import { haptic } from '../../gestures/haptics';

export function PathsSheet() {
  const close = useUI((s) => s.closeSheet);
  const closeAll = useUI((s) => s.closeAllSheets);
  const openSheet = useUI((s) => s.openSheet);
  const d = useStore(activeData);
  const updatePath = useStore((s) => s.updatePath);
  const removePath = useStore((s) => s.removePath);
  const suggestions = useSuggestions();
  const [editing, setEditing] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const cur = currentVideoId();
  const curVideo = cur ? lookupVideo(cur) : undefined;
  const paths = [...d.paths].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt);

  return (
    <Sheet onClose={close} title="Smart Paths" subtitle="Parallel feeds. Swipe from the edge or with two fingers to hop between them." tall>
      <ul className="pathlist">
        {paths.map((p) => {
          const head = lookupVideo(p.queue[Math.min(p.index, p.queue.length - 1)]);
          const active = p.id === d.activePathId;
          return (
            <li key={p.id} className={`pathlist__item${active ? ' pathlist__item--on' : ''}`}>
              <button
                type="button"
                className="pathlist__main"
                onClick={() => {
                  haptic('selection');
                  activatePath(p.id);
                  closeAll();
                }}
              >
                {head ? <Thumb video={head} width={72} className="pathlist__thumb" /> : <span className="pathlist__thumb pathlist__thumb--empty">{PATH_KINDS[p.seed.kind].icon}</span>}
                <span className="pathlist__text">
                  {editing === p.id ? (
                    <input
                      autoFocus
                      value={label}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setLabel(e.target.value)}
                      onBlur={() => {
                        if (label.trim()) updatePath(p.id, { label: label.trim() });
                        setEditing(null);
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                      aria-label="Path name"
                    />
                  ) : (
                    <strong>
                      {PATH_KINDS[p.seed.kind].icon} {p.label}
                    </strong>
                  )}
                  <small>
                    {PATH_KINDS[p.seed.kind].title} · {Math.min(p.index + 1, p.queue.length)} of {p.exhausted ? p.queue.length : `${p.queue.length}+`}
                    {countActive(p.filters) > 0 && ` · ${countActive(p.filters)} filter${countActive(p.filters) === 1 ? '' : 's'}`} · {timeAgo(p.updatedAt)}
                  </small>
                </span>
              </button>
              <div className="pathlist__actions">
                <button type="button" className="icon-btn icon-btn--small" aria-label={p.pinned ? 'Unpin' : 'Pin'} onClick={() => updatePath(p.id, { pinned: !p.pinned })}>
                  {p.pinned ? '★' : '☆'}
                </button>
                <button type="button" className="icon-btn icon-btn--small" aria-label="Rename" onClick={() => { setEditing(p.id); setLabel(p.label); }}>
                  <IconPencil size={16} />
                </button>
                {p.seed.kind !== 'forYou' && (
                  <button type="button" className="icon-btn icon-btn--small" aria-label="Delete path" onClick={() => removePath(p.id)}>
                    <IconTrash size={16} />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {curVideo && (
        <MenuItem icon={<IconBranch />} label="Branch from the current clip…" hint={curVideo.title} onClick={() => openSheet({ kind: 'more-like', videoId: curVideo.id, title: 'Branch a new path' })} />
      )}
      <MenuItem icon={<IconTarget />} label="Visual search" hint="Pick any clip you’ve seen and a facet" onClick={() => openSheet({ kind: 'visual-search' })} />
      {suggestions.length > 0 && (
        <div className="pathsugg">
          <h3>
            <IconSparkle size={16} /> AI path ideas
          </h3>
          {suggestions.map((s) => (
            <MenuItem
              key={s.id}
              icon={PATH_KINDS.cluster.icon}
              label={s.label}
              hint={s.reason}
              tone="accent"
              onClick={() => {
                startPath(s.seed, { label: s.label });
                closeAll();
              }}
            />
          ))}
        </div>
      )}
    </Sheet>
  );
}

export function ProfilesSheet() {
  const close = useUI((s) => s.closeSheet);
  const profiles = useStore((s) => s.profiles);
  const active = useStore(activeProfile);
  const data = useStore((s) => s.data);
  const switchProfile = useStore((s) => s.switchProfile);
  const createProfile = useStore((s) => s.createProfile);
  const incognito = useStore((s) => s.incognito);
  const setIncognito = useStore((s) => s.setIncognito);
  const pause = useStore((s) => s.settings.pauseLearning);
  const setSettings = useStore((s) => s.setSettings);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(PROFILE_EMOJI[1]);
  const [copy, setCopy] = useState(false);

  return (
    <Sheet onClose={close} title="Taste profiles" subtitle="Each profile learns on its own — paths, library, history, and filters stay separate.">
      <ul className="proflist">
        {profiles.map((p) => {
          const d = data[p.id];
          return (
            <li key={p.id}>
              <button
                type="button"
                className={`proflist__item${p.id === active.id ? ' proflist__item--on' : ''}`}
                style={{ ['--pc' as string]: p.color }}
                onClick={() => {
                  haptic('selection');
                  switchProfile(p.id);
                  close();
                }}
              >
                <span className="proflist__emoji">{p.emoji}</span>
                <span className="proflist__text">
                  <strong>{p.name}</strong>
                  <small>
                    {plural(d?.signals.length ?? 0, 'signal')} · {d?.saves.length ?? 0} saved · {plural(d?.paths.length ?? 0, 'path')}
                  </small>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {creating ? (
        <form
          className="newprof"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            createProfile({ name: name.trim(), emoji, color: PROFILE_COLORS[profiles.length % PROFILE_COLORS.length], copyFrom: copy ? active.id : undefined });
            close();
          }}
        >
          <div className="emoji-row">
            {PROFILE_EMOJI.map((e) => (
              <button key={e} type="button" className={`emoji-pick${e === emoji ? ' emoji-pick--on' : ''}`} onClick={() => setEmoji(e)}>
                {e}
              </button>
            ))}
          </div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Profile name (e.g. Late night)" autoFocus aria-label="Profile name" />
          <Toggle checked={copy} onChange={setCopy} label={`Start from a copy of “${active.name}”`} hint="Otherwise starts blank" />
          <button className="btn btn--primary btn--block" type="submit" disabled={!name.trim()}>
            Create & switch
          </button>
        </form>
      ) : (
        <MenuItem icon={<IconPlus />} label="New profile" onClick={() => setCreating(true)} />
      )}
      <div className="sheet__toggles">
        <Toggle checked={incognito} onChange={setIncognito} label="Incognito session" hint="Nothing recorded — no signals, history, or searches — until you turn it off or reload" />
        <Toggle checked={pause} onChange={(v) => setSettings({ pauseLearning: v })} label="Pause learning" hint="History still records; taste stops updating" />
      </div>
    </Sheet>
  );
}

export function AspectResultSheet({ videoId }: { videoId: string }) {
  const close = useUI((s) => s.closeSheet);
  const closeAll = useUI((s) => s.closeAllSheets);
  const draft = useUI((s) => s.aspectDraft);
  const tx = useTaxonomy((s) => s.tx);
  const [intent, setIntent] = useState<AspectIntent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(0);
  const video = lookupVideo(videoId);

  useEffect(() => {
    if (!draft || !video || !tx) return;
    let alive = true;
    ai()
      .interpretAspect({ video, hit: draft.hit, regionLabel: draft.regionLabel, text: draft.text, quickFacet: draft.quickFacet }, tx)
      .then((r) => alive && setIntent(r))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [draft, video, tx]);

  // Reveal reasoning steps one at a time.
  useEffect(() => {
    if (!intent || shown >= intent.steps.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), 260);
    return () => clearTimeout(t);
  }, [intent, shown]);

  const start = () => {
    if (!intent || !video) return;
    noteCapture(video.id);
    startPath(
      { kind: 'aspect', videoId: video.id, vector: intent.vector, facets: intent.facets, tagIds: intent.tagIds, excludeTagIds: intent.excludeTagIds, label: intent.label },
      { startWith: [video.id], label: intent.label },
    );
    useUI.getState().toast({ text: `⌖ New path: ${intent.label}`, tone: 'capture' });
    closeAll();
  };

  return (
    <Sheet onClose={close} title="Aspect Capture" subtitle={video?.title}>
      <div className="aspect">
        {video && <Thumb video={video} width={110} className="aspect__thumb" />}
        <div className="aspect__body">
          {error && <p className="error">{error}</p>}
          {!intent && !error && (
            <div className="aspect__thinking">
              <Spinner /> Reading the region and your words…
            </div>
          )}
          {intent && (
            <>
              <ol className="aspect__steps">
                {intent.steps.slice(0, shown).map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
              {shown >= intent.steps.length && (
                <>
                  <div className="aspect__facets">
                    {Object.entries(intent.facets).map(([f, w]) => (
                      <span key={f} className="facetbar">
                        <span>{f}</span>
                        <span className="facetbar__track">
                          <span style={{ width: `${Math.round((w ?? 0) * 100)}%` }} />
                        </span>
                      </span>
                    ))}
                  </div>
                  {intent.tagIds.length > 0 && (
                    <div className="chips">
                      {intent.tagIds.map((t) => (
                        <Chip key={t} tone="capture">
                          #{tx?.tags.find((x) => x.id === t)?.label ?? t}
                        </Chip>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
      <button className="btn btn--primary btn--block btn--capture" disabled={!intent || shown < (intent?.steps.length ?? 1)} onClick={start}>
        <IconTarget size={18} /> Start “{intent?.label ?? '…'}” path
      </button>
    </Sheet>
  );
}
