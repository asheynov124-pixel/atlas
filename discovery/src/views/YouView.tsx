/**
 * "You": profile, taste insights with full edit controls, signal log, blocks,
 * privacy & data, playback/gesture settings, and the mock data-layer console.
 */
import { useMemo, useRef, useState } from 'react';
import { useStore, activeData, activeProfile, exportData, PROFILE_COLORS, PROFILE_EMOJI } from '../state/store';
import { useUI } from '../state/ui';
import { useTaxonomy } from '../state/taxonomy';
import { useModel, lookupVideo } from '../state/selectors';
import { rebuildAhead, startPath } from '../state/feed';
import { mockSource, dataSource } from '../data/api';
import { ai } from '../ai';
import { kmeans, suggestK } from '../ai/cluster';
import { describeCluster } from '../ai/suggest';
import { topWeights } from '../engine/learning';
import { countActive } from '../engine/filters';
import { EXPLICIT_SIGNALS, type Blocks, type Overrides, type SignalKind } from '../engine/types';
import type { VideoSummary } from '../data/types';
import { mean } from '../lib/vec';
import { timeAgo } from '../lib/format';
import { sha256 } from '../lib/crypto';
import { Chip, EmptyState, Section, Segmented, Toggle, WeightBar } from '../components/common';
import { Thumb } from '../components/Thumb';
import { IconDownload, IconLock, IconPlay, IconSliders, IconTrash, IconUpload, IconX } from '../components/Icons';

const SIGNAL_ICON: Record<SignalKind, string> = { like: '♥', dislike: '✕', save: '🔖', capture: '⌖', more: '⊕', less: '⊖', watch: '◷', rewatch: '↻', skip: '»' };

export function YouView() {
  return (
    <div className="page you">
      <ProfileCard />
      <Insights />
      <SignalLog />
      <BlocksPanel />
      <PrivacyPanel />
      <PlaybackPanel />
      <DevPanel />
      <footer className="about">
        <p>
          <strong>PH Discovery</strong> prototype · data source: <code>{dataSource().name}</code> · AI: <code>{ai().name}</code>
        </p>
        <p>Runs entirely on a local mock catalog. Every performer is a fictional adult. All learning data stays on this device.</p>
      </footer>
    </div>
  );
}

function ProfileCard() {
  const p = useStore(activeProfile);
  const d = useStore(activeData);
  const profiles = useStore((s) => s.profiles.length);
  const updateProfile = useStore((s) => s.updateProfile);
  const openSheet = useUI((s) => s.openSheet);
  const model = useModel();
  const [name, setName] = useState(p.name);
  return (
    <div className="profile-card" style={{ ['--pc' as string]: p.color }}>
      <div className="profile-card__top">
        <button type="button" className="profile-card__emoji" onClick={() => updateProfile(p.id, { emoji: PROFILE_EMOJI[(PROFILE_EMOJI.indexOf(p.emoji) + 1) % PROFILE_EMOJI.length] })} aria-label="Change emoji">
          {p.emoji}
        </button>
        <input className="profile-card__name" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && updateProfile(p.id, { name: name.trim() })} aria-label="Profile name" />
        <button className="btn btn--small" onClick={() => openSheet({ kind: 'profiles' })}>
          Switch ({profiles})
        </button>
      </div>
      <div className="profile-card__colors">
        {PROFILE_COLORS.map((c) => (
          <button key={c} type="button" className={`swatch${c === p.color ? ' swatch--on' : ''}`} style={{ background: c }} onClick={() => updateProfile(p.id, { color: c })} aria-label={`Color ${c}`} />
        ))}
      </div>
      <div className="stats">
        <Stat n={model.counts.like} label="likes" />
        <Stat n={model.counts.dislike} label="passes" />
        <Stat n={d.saves.length} label="saved" />
        <Stat n={model.counts.total} label="signals" />
        <Stat n={d.paths.length} label="paths" />
      </div>
    </div>
  );
}

const Stat = ({ n, label }: { n: number; label: string }) => (
  <div className="stat">
    <b>{n}</b>
    <small>{label}</small>
  </div>
);

function WeightEditor({ type, id, label, value, learned, overridden }: { type: keyof Overrides; id: string; label: string; value: number; learned: number; overridden: boolean }) {
  const setOverride = useStore((s) => s.setOverride);
  const [open, setOpen] = useState(false);
  return (
    <li className="weight-row">
      <button type="button" className="weight-row__main" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="weight-row__label">
          {label}
          {overridden && <em> · edited</em>}
        </span>
        <WeightBar value={value} />
        <b>{value > 0 ? '+' : ''}{value.toFixed(1)}</b>
      </button>
      {open && (
        <div className="weight-row__edit">
          <input
            type="range"
            min={-3}
            max={3}
            step={0.1}
            value={value}
            onChange={(e) => setOverride(type, id, Number(e.target.value))}
            onPointerUp={() => rebuildAhead()}
            aria-label={`Weight for ${label}`}
          />
          <div className="row">
            {overridden && (
              <button className="btn btn--small" onClick={() => { setOverride(type, id, null); rebuildAhead(); }}>
                Reset to learned ({learned.toFixed(1)})
              </button>
            )}
            <button className="btn btn--small" onClick={() => { setOverride(type, id, 0); rebuildAhead(); }}>
              Ignore
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function Insights() {
  const model = useModel();
  const overrides = useStore((s) => activeData(s).overrides);
  const filters = useStore((s) => activeData(s).filters);
  const tags = useTaxonomy((s) => s.tag);
  const performers = useTaxonomy((s) => s.performer);
  const studios = useTaxonomy((s) => s.studio);
  const tx = useTaxonomy((s) => s.tx);
  const openSheet = useUI((s) => s.openSheet);
  const [showNeg, setShowNeg] = useState(false);

  const clusters = useMemo(() => {
    if (!tx) return [];
    const vids = model.positives.map((p) => lookupVideo(p.videoId)).filter((v): v is VideoSummary => !!v);
    if (vids.length < 3) return [];
    return kmeans(vids.map((v) => v.embedding), suggestK(vids.length)).map((c) => {
      const members = c.members.map((i) => vids[i]);
      return { ...describeCluster(members, c.centroid, tx), members };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.positives.length, tx]);

  const sign = showNeg ? -1 : 1;
  const rows = (w: Record<string, number>, learned: Record<string, number>, type: keyof Overrides, name: (id: string) => string) =>
    topWeights(w, 8, sign).map(([id, v]) => <WeightEditor key={id} type={type} id={id} label={name(id)} value={v} learned={learned[id] ?? 0} overridden={id in overrides[type]} />);

  const tagRows = rows(model.tagW, model.learned.tagW, 'tags', (id) => `#${tags.get(id)?.label ?? id}`);
  const perfRows = rows(model.performerW, model.learned.performerW, 'performers', (id) => performers.get(id)?.name ?? id);
  const studioRows = rows(model.studioW, model.learned.studioW, 'studios', (id) => studios.get(id)?.name ?? id);

  return (
    <Section
      title="What this profile has learned"
      action={<Segmented value={showNeg ? 'neg' : 'pos'} onChange={(v) => setShowNeg(v === 'neg')} options={[{ value: 'pos', label: 'Into' }, { value: 'neg', label: 'Not into' }]} />}
    >
      {model.counts.total === 0 ? (
        <EmptyState icon="✦" title="Nothing learned yet" body="Swipe in the feed — likes, passes, saves, and how long you watch all count. You can edit everything here." />
      ) : (
        <>
          <p className="muted small">Tap any row to adjust its weight by hand. Edits override what was learned; reset any time.</p>
          {tagRows.length > 0 && <h3 className="subhead">Tags</h3>}
          <ul className="weights">{tagRows}</ul>
          {perfRows.length > 0 && <h3 className="subhead">Performers</h3>}
          <ul className="weights">{perfRows}</ul>
          {studioRows.length > 0 && <h3 className="subhead">Studios</h3>}
          <ul className="weights">{studioRows}</ul>
          {!showNeg && clusters.length > 0 && (
            <>
              <h3 className="subhead">Visual clusters in your likes</h3>
              <ul className="clusters">
                {clusters.map((c) => (
                  <li key={c.memberIds.join()}>
                    <div className="clusters__thumbs">
                      {c.members.slice(0, 3).map((v) => (
                        <Thumb key={v.id} video={v} width={60} />
                      ))}
                    </div>
                    <div className="clusters__text">
                      <strong>{c.label}</strong>
                      <small>
                        {c.members.length} clips · holds together on{' '}
                        {Object.entries(c.facets)
                          .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0]}
                      </small>
                    </div>
                    <button
                      className="icon-btn icon-btn--small"
                      aria-label={`Start ${c.label} path`}
                      onClick={() => startPath({ kind: 'cluster', vector: mean(c.members.map((m) => m.embedding)), facets: c.facets, tagIds: c.tagIds, label: c.label }, { label: c.label, show: true })}
                    >
                      <IconPlay size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      <button className="btn btn--block" onClick={() => openSheet({ kind: 'filters', scope: 'global' })}>
        <IconSliders size={16} /> Profile-wide filters{countActive(filters) ? ` (${countActive(filters)} active)` : ''}
      </button>
    </Section>
  );
}

function SignalLog() {
  const signals = useStore((s) => activeData(s).signals);
  const removeSignal = useStore((s) => s.removeSignal);
  const [kind, setKind] = useState<'all' | 'explicit' | 'implicit'>('all');
  const [limit, setLimit] = useState(20);
  const list = signals
    .filter((s) => kind === 'all' || (kind === 'explicit') === EXPLICIT_SIGNALS.includes(s.kind))
    .slice()
    .reverse();
  return (
    <Section title="Signal log" action={<Segmented value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, { value: 'explicit', label: 'Explicit' }, { value: 'implicit', label: 'Implicit' }]} />}>
      {!list.length ? (
        <p className="muted">No signals yet.</p>
      ) : (
        <>
          <p className="muted small">Delete a signal and the model forgets it exactly — taste is recomputed from this log.</p>
          <ul className="siglog">
            {list.slice(0, limit).map((s) => {
              const v = lookupVideo(s.videoId);
              return (
                <li key={s.id}>
                  <span className={`siglog__icon siglog__icon--${s.kind}`}>{SIGNAL_ICON[s.kind]}</span>
                  <span className="siglog__text">
                    <strong>{v?.title ?? s.videoId}</strong>
                    <small>
                      {s.kind}
                      {s.fraction != null && ` · ${Math.round(s.fraction * 100)}% watched`}
                      {s.loops ? ` · ${s.loops}× replay` : ''} · {timeAgo(s.at)}
                    </small>
                  </span>
                  <b className={s.value < 0 ? 'neg' : ''}>{s.value > 0 ? '+' : ''}{s.value.toFixed(2)}</b>
                  <button className="icon-btn icon-btn--small" aria-label="Delete signal" onClick={() => removeSignal(s.id)}>
                    <IconX size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
          {list.length > limit && (
            <button className="btn btn--block btn--ghost" onClick={() => setLimit((l) => l + 40)}>
              Show more ({list.length - limit})
            </button>
          )}
        </>
      )}
    </Section>
  );
}

function BlocksPanel() {
  const blocks = useStore((s) => activeData(s).blocks);
  const addBlock = useStore((s) => s.addBlock);
  const removeBlock = useStore((s) => s.removeBlock);
  const tx = useTaxonomy((s) => s.tx);
  const tags = useTaxonomy((s) => s.tag);
  const performers = useTaxonomy((s) => s.performer);
  const studios = useTaxonomy((s) => s.studio);
  const [q, setQ] = useState('');
  const total = blocks.videos.length + blocks.performers.length + blocks.studios.length + blocks.tags.length;
  const matches = useMemo(() => {
    if (!tx || !q.trim()) return [];
    const s = q.toLowerCase();
    return [
      ...tx.tags.filter((t) => t.label.toLowerCase().includes(s)).map((t) => ({ type: 'tags' as const, id: t.id, label: `#${t.label}` })),
      ...tx.performers.filter((p) => p.name.toLowerCase().includes(s)).map((p) => ({ type: 'performers' as const, id: p.id, label: p.name })),
      ...tx.studios.filter((x) => x.name.toLowerCase().includes(s)).map((x) => ({ type: 'studios' as const, id: x.id, label: x.name })),
    ].slice(0, 8);
  }, [q, tx]);
  const label = (type: keyof Blocks, id: string) =>
    type === 'tags' ? `#${tags.get(id)?.label ?? id}` : type === 'performers' ? performers.get(id)?.name ?? id : type === 'studios' ? studios.get(id)?.name ?? id : lookupVideo(id)?.title ?? 'A clip';
  return (
    <Section title={`Never show${total ? ` (${total})` : ''}`}>
      <p className="muted small">Hard blocks remove matches everywhere — feeds, search, and collections. Passing on a clip only lowers similar ones.</p>
      <input className="search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Block a tag, performer, or studio…" aria-label="Find something to block" />
      {matches.length > 0 && (
        <div className="chips">
          {matches.map((m) => (
            <Chip key={`${m.type}:${m.id}`} tone="dislike" onClick={() => { addBlock(m.type, m.id); setQ(''); rebuildAhead(); }}>
              + {m.label}
            </Chip>
          ))}
        </div>
      )}
      <div className="chips">
        {(Object.keys(blocks) as (keyof Blocks)[]).flatMap((type) =>
          blocks[type].map((id) => (
            <Chip key={`${type}:${id}`} tone="dislike" onRemove={() => { removeBlock(type, id); rebuildAhead(); }}>
              {label(type, id)}
            </Chip>
          )),
        )}
      </div>
    </Section>
  );
}

function PrivacyPanel() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const incognito = useStore((s) => s.incognito);
  const setIncognito = useStore((s) => s.setIncognito);
  const profile = useStore(activeProfile);
  const profiles = useStore((s) => s.profiles.length);
  const resetLearning = useStore((s) => s.resetLearning);
  const deleteProfile = useStore((s) => s.deleteProfile);
  const wipe = useStore((s) => s.wipeEverything);
  const importData = useStore((s) => s.importData);
  const toast = useUI((s) => s.toast);
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState<null | 'reset' | 'delete' | 'wipe'>(null);
  const [pin, setPin] = useState('');
  const [pinStage, setPinStage] = useState<'idle' | 'enter' | 'confirm'>('idle');
  const [firstPin, setFirstPin] = useState('');

  const download = () => {
    const blob = new Blob([exportData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ph-discovery-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const submitPin = async () => {
    if (!/^\d{4,8}$/.test(pin)) return toast({ text: 'Use 4–8 digits', tone: 'error' });
    if (pinStage === 'enter') {
      setFirstPin(pin);
      setPin('');
      setPinStage('confirm');
      return;
    }
    if (pin !== firstPin) {
      setPin('');
      setPinStage('enter');
      return toast({ text: 'PINs didn’t match — try again', tone: 'error' });
    }
    setSettings({ pinHash: await sha256(pin) });
    setPin('');
    setPinStage('idle');
    toast({ text: 'App lock on', tone: 'info' });
  };

  const doConfirm = () => {
    if (confirm === 'reset') {
      resetLearning();
      rebuildAhead();
      toast({ text: `${profile.name}: learning reset`, tone: 'info' });
    } else if (confirm === 'delete') deleteProfile(profile.id);
    else if (confirm === 'wipe') {
      wipe();
      toast({ text: 'Everything erased from this device', tone: 'info' });
    }
    setConfirm(null);
  };

  return (
    <Section title="Privacy & data">
      <Toggle checked={incognito} onChange={setIncognito} label="Incognito session" hint="Writes nothing to the device; turning it off rewinds to where you were (imports made meanwhile are dropped)" />
      <Toggle checked={settings.pauseLearning} onChange={(v) => setSettings({ pauseLearning: v })} label="Pause learning" hint="Taste stops updating; history still records" />
      <Toggle checked={settings.discreet} onChange={(v) => setSettings({ discreet: v })} label="Discreet thumbnails" hint="Blur grids and lists until you press on them" />
      <div className="toggle-row">
        <span className="toggle-row__text">
          <span>
            <IconLock size={14} /> App lock
          </span>
          <small>{settings.pinHash ? `On · locks after ${settings.lockAfterMin} min away` : 'Ask for a PIN when the app opens'}</small>
        </span>
        {settings.pinHash ? (
          <button className="btn btn--small" onClick={() => setSettings({ pinHash: undefined })}>
            Turn off
          </button>
        ) : (
          pinStage === 'idle' && (
            <button className="btn btn--small" onClick={() => setPinStage('enter')}>
              Set PIN
            </button>
          )
        )}
      </div>
      {pinStage !== 'idle' && (
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); void submitPin(); }}>
          <input type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder={pinStage === 'enter' ? 'New PIN (4–8 digits)' : 'Confirm PIN'} aria-label="PIN" autoFocus />
          <button className="btn" type="submit">
            {pinStage === 'enter' ? 'Next' : 'Save'}
          </button>
          <button className="btn btn--ghost" type="button" onClick={() => { setPinStage('idle'); setPin(''); }}>
            Cancel
          </button>
        </form>
      )}
      {settings.pinHash && (
        <label className="frow">
          <span>Lock after</span>
          <select value={settings.lockAfterMin} onChange={(e) => setSettings({ lockAfterMin: Number(e.target.value) })}>
            {[0, 1, 5, 15, 60].map((m) => (
              <option key={m} value={m}>
                {m === 0 ? 'Immediately' : `${m} min`}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="row row--wrap">
        <button className="btn" onClick={download}>
          <IconDownload size={16} /> Export my data
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          <IconUpload size={16} /> Import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              importData(await f.text());
              toast({ text: 'Data imported', tone: 'info' });
            } catch (err) {
              toast({ text: (err as Error).message, tone: 'error' });
            }
            e.target.value = '';
          }}
        />
      </div>
      <div className="danger-zone">
        <button className="btn btn--ghost btn--danger" onClick={() => setConfirm('reset')}>
          Reset “{profile.name}” learning
        </button>
        {profiles > 1 && (
          <button className="btn btn--ghost btn--danger" onClick={() => setConfirm('delete')}>
            <IconTrash size={16} /> Delete profile
          </button>
        )}
        <button className="btn btn--ghost btn--danger" onClick={() => setConfirm('wipe')}>
          Erase everything
        </button>
      </div>
      {confirm && (
        <div className="confirm" role="alertdialog">
          <p>
            {confirm === 'reset' && `Delete every signal and manual edit for “${profile.name}”? Saves, boards, and history stay.`}
            {confirm === 'delete' && `Delete “${profile.name}” and everything in it — signals, paths, saves, boards, history?`}
            {confirm === 'wipe' && 'Erase all profiles, library, history, and settings from this device? This can’t be undone.'}
          </p>
          <div className="row">
            <button className="btn btn--danger" onClick={doConfirm}>
              Yes, do it
            </button>
            <button className="btn btn--ghost" onClick={() => setConfirm(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}

function PlaybackPanel() {
  const s = useStore((st) => st.settings);
  const set = useStore((st) => st.setSettings);
  const resetHints = useStore((st) => st.resetHints);
  return (
    <Section title="Playback & gestures">
      <div className="frow">
        <span>Gesture scheme</span>
        <Segmented
          value={s.gestureScheme}
          onChange={(v) => set({ gestureScheme: v })}
          options={[
            { value: 'discovery', label: '↑ Save ↓ Capture' },
            { value: 'classic', label: '↑↓ Next/prev' },
          ]}
        />
      </div>
      <p className="muted small">
        {s.gestureScheme === 'discovery'
          ? 'Vertical swipes save and capture; use the screen edge or two fingers to move between clips.'
          : 'TikTok-style: vertical swipes move between clips; save and capture live on the buttons and long-press menu.'}
      </p>
      <Toggle checked={s.advanceOnJudge} onChange={(v) => set({ advanceOnJudge: v })} label="Move on after like / pass" />
      <Toggle checked={s.advanceOnSave} onChange={(v) => set({ advanceOnSave: v })} label="Move on after save" />
      <Toggle checked={s.haptics} onChange={(v) => set({ haptics: v })} label="Haptics" hint="Vibration on Android; system tick on iOS 18+" />
      <Toggle checked={s.muted} onChange={(v) => set({ muted: v })} label="Start muted" />
      <Toggle checked={s.leftHanded} onChange={(v) => set({ leftHanded: v })} label="Left-handed layout" hint="Moves the action rail to the left" />
      <Toggle checked={s.immersive} onChange={(v) => set({ immersive: v })} label="Immersive overlay" hint="Hide controls after a few seconds; tap to bring them back" />
      <Toggle checked={s.dataSaver} onChange={(v) => set({ dataSaver: v })} label="Data saver" hint="Preload one clip ahead instead of two, and hold imported thumbnails until you ask" />
      <button className="btn btn--ghost btn--block" onClick={resetHints}>
        Show the gesture guide again
      </button>
    </Section>
  );
}

function DevPanel() {
  const mock = useStore((s) => s.settings.mock);
  const set = useStore((s) => s.setSettings);
  const rememberContent = useStore((s) => s.rememberContent);
  const toast = useUI((s) => s.toast);
  const update = (patch: Partial<typeof mock>) => {
    const next = { ...mock, ...patch };
    set({ mock: next });
    mockSource.configure(next);
  };
  const seedDemo = () => {
    // Fast-forward a believable session so AI clusters and suggestions have material.
    const cat = mockSource.catalog;
    const st = useStore.getState();
    const lead = [...cat.performers].sort((a, b) => b.videoCount - a.videoCount)[1];
    const leadClips = cat.videos.filter((v) => v.performerIds[0] === lead.id).slice(0, 7);
    const neon = cat.videos.filter((v) => v.tags.includes('neon') && !leadClips.includes(v)).slice(0, 6);
    const beach = cat.videos.filter((v) => v.tags.includes('beach') && !v.tags.includes('neon')).slice(0, 5);
    const pass = cat.videos.filter((v) => v.tags.includes('handheld') && !v.tags.includes('neon')).slice(0, 5);
    rememberContent([...leadClips, ...neon, ...beach, ...pass]);
    for (const v of [...leadClips, ...neon, ...beach]) st.addSignal('like', v.id);
    for (const v of pass) st.addSignal('dislike', v.id);
    for (const v of [...leadClips.slice(0, 3), ...neon.slice(0, 3), ...beach.slice(0, 2)]) {
      st.addSave({ videoId: v.id, pathLabel: 'Demo seed' });
      st.addSignal('save', v.id);
    }
    rebuildAhead();
    toast({ text: `Seeded ${leadClips.length + neon.length + beach.length} likes, ${pass.length} passes, 8 saves`, tone: 'info' });
  };
  return (
    <Section title="Mock data layer">
      <p className="muted small">
        {mockSource.catalog.videos.length} clips · {mockSource.catalog.performers.length} performers · {mockSource.catalog.studios.length} studios · seed {mockSource.catalog.seed}. Tune these to exercise loading, error, and fallback states.
      </p>
      <Slider label="Latency" value={mock.latencyMs} min={0} max={2000} step={50} unit="ms" onChange={(v) => update({ latencyMs: v })} />
      <Slider label="Jitter" value={mock.jitterMs} min={0} max={1000} step={50} unit="ms" onChange={(v) => update({ jitterMs: v })} />
      <Slider label="Error rate" value={Math.round(mock.errorRate * 100)} min={0} max={100} step={5} unit="%" onChange={(v) => update({ errorRate: v / 100 })} />
      <Slider label="Embed failures" value={mock.embedFailPct} min={0} max={100} step={5} unit="%" onChange={(v) => update({ embedFailPct: v })} />
      <button className="btn btn--block" onClick={seedDemo}>
        Seed a demo taste (likes, passes, saves)
      </button>
    </Section>
  );
}

function Slider({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) {
  return (
    <label className="frow frow--slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <b>
        {value}
        {unit}
      </b>
    </label>
  );
}
