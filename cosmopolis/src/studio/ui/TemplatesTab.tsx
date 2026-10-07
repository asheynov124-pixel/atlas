/**
 * OWNER: studio.
 * Templates tab — start points (Surprise me, blank lot, 18 templates with 3D portraits), this city's saved designs
 * (edit · place · duplicate · share · delete), the device library (designs from your other cities) and import of
 * share codes (paste / type).
 */
import { useState } from 'preact/hooks';
import { game } from '../../game/instance';
import { thumbnailSignal } from '../../render/Thumbnails';
import { Button, Chip, Icon, IconButton, Modal, SectionHeader, TextInput, fmtMoney, notify, uiSound } from '../../ui/core';
import { getItem } from '../../content/catalog';
import { defIdOf, type DesignSpec } from '../model';
import { studioUi } from '../state';
import { fnDef } from '../stats';
import { TEMPLATES } from '../templates';

function Thumb({ defId, fallback }: { defId: string; fallback: string }) {
  const url = thumbnailSignal(defId, { size: 'sm' }).value;
  return <span class="st-thumb">{url ? <img src={url} alt="" draggable={false} /> : <span class="st-thumb-ph">{fallback}</span>}</span>;
}

const FP_LABEL: Record<number, string> = { 1: '1 tile', 7: '7 tiles', 19: '19 tiles' };

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function TemplatesTab({ draft }: { draft: DesignSpec }) {
  const st = game.studio;
  try {
    st.ensureTemplateDefs();
  } catch (e) {
    console.warn('[studio] template previews unavailable', e);
  }
  const designs = studioUi.designs.value;
  const library = studioUi.library.value;
  const [menu, setMenu] = useState<DesignSpec | null>(null);
  const [share, setShare] = useState<{ name: string; code: string } | null>(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const sandbox = game.empire?.sandbox;

  const doImport = (text: string) => {
    const r = st.importCode(text);
    if (!r.ok) setErr(r.error ?? 'Could not read that code.');
    else {
      setErr(null);
      setCode('');
    }
  };
  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) {
        setCode(t);
        doImport(t);
      } else setErr('The clipboard is empty — paste the code into the field instead.');
    } catch {
      setErr('Clipboard access was blocked — long-press the field and choose Paste.');
    }
  };
  const openShare = (d: DesignSpec) => {
    const c = st.exportCode(d.id) || st.exportCode();
    setShare({ name: d.name, code: c });
    void copyText(c).then((ok) => ok && notify({ title: 'Share code copied', body: `${d.icon} ${d.name}`, kind: 'good', icon: 'copy' }));
  };

  return (
    <div class="st-tab st-templates">
      <div class="st-starts">
        <button type="button" class="st-start is-surprise" onClick={() => st.surprise()}>
          <span class="st-start-icon">
            <Icon name="dice" size={24} />
          </span>
          <span class="st-start-text">
            <span class="st-start-title">Surprise me</span>
            <span class="st-start-sub">A brand-new random building</span>
          </span>
        </button>
        <button type="button" class="st-start" onClick={() => st.blank()}>
          <span class="st-start-icon">
            <Icon name="plus" size={24} />
          </span>
          <span class="st-start-text">
            <span class="st-start-title">Blank lot</span>
            <span class="st-start-sub">Start from a bare plinth</span>
          </span>
        </button>
      </div>

      <SectionHeader title="Templates" subtitle="Tap to load — you can always undo" action={<span class="st-count num">{TEMPLATES.length}</span>} />
      <div class="st-tpl-grid">
        {TEMPLATES.map((t) => (
          <button key={t.id} type="button" class={'st-tpl' + (draft.base === t.id ? ' is-active' : '')} onClick={() => st.loadTemplate(t.id)} title={t.blurb}>
            <Thumb defId={st.templateDefId(t.id)} fallback={t.icon} />
            <span class="st-tpl-name">{t.name}</span>
            <span class="st-tpl-meta">
              {fnDef(t.fn).label} · {FP_LABEL[t.footprint]}
            </span>
          </button>
        ))}
      </div>

      <SectionHeader title="My designs" subtitle="Saved in this city" action={<span class="st-count num">{designs.length}</span>} />
      {designs.length === 0 && <p class="st-note st-pad">Designs you save appear here and in Build › My Designs.</p>}
      <div class="st-designs">
        {designs.map((d) => {
          const def = getItem(defIdOf(d.id));
          const placed = st.placedCount(d.id);
          const editing = studioUi.editingId.value === d.id;
          return (
            <div key={d.id} class={'st-design' + (editing ? ' is-active' : '')}>
              <Thumb defId={defIdOf(d.id)} fallback={d.icon} />
              <div class="st-design-text">
                <span class="st-design-name">
                  {d.icon} {d.name}
                </span>
                <span class="st-design-meta">
                  {fnDef(d.fn).label} · {FP_LABEL[d.footprint]}
                  {!sandbox && def ? ` · ${fmtMoney(def.cost, true)}` : ''}
                  {placed > 0 ? ` · ${placed} built` : ''}
                </span>
              </div>
              <Button size="sm" variant={editing ? 'primary' : 'secondary'} icon="edit" onClick={() => st.open(d.id, { tab: 'parts' })}>
                {editing ? 'Editing' : 'Edit'}
              </Button>
              <IconButton icon="more" label={`More for ${d.name}`} size="sm" variant="ghost" onClick={() => setMenu(d)} />
            </div>
          );
        })}
      </div>

      {library.length > 0 && (
        <>
          <SectionHeader title="From your other cities" subtitle="Your device library" action={<span class="st-count num">{library.length}</span>} />
          <div class="st-designs">
            {library.map((d) => (
              <div key={d.id} class="st-design">
                <Thumb defId={defIdOf(d.id)} fallback={d.icon} />
                <div class="st-design-text">
                  <span class="st-design-name">
                    {d.icon} {d.name}
                  </span>
                  <span class="st-design-meta">
                    {fnDef(d.fn).label} · {FP_LABEL[d.footprint]}
                  </span>
                </div>
                <Button size="sm" variant="secondary" icon="download" onClick={() => st.adoptFromLibrary(d.id)}>
                  Add
                </Button>
                <IconButton icon="trash" label={`Remove ${d.name} from the library`} size="sm" variant="ghost" onClick={() => st.removeFromLibrary(d.id)} />
              </div>
            ))}
          </div>
        </>
      )}

      <SectionHeader title="Import a design" subtitle="Paste a share code (starts with CSM1.)" />
      <div class="st-import">
        <TextInput
          value={code}
          onChange={(v) => {
            setCode(v);
            setErr(null);
          }}
          onSubmit={(v) => doImport(v)}
          placeholder="CSM1.…"
          icon="link"
          maxLength={20000}
        />
        <div class="st-import-actions">
          <Button size="sm" variant="secondary" icon="copy" onClick={() => void paste()}>
            Paste
          </Button>
          <Button size="sm" variant="primary" icon="download" disabled={!code.trim()} onClick={() => doImport(code)}>
            Import
          </Button>
        </div>
        {err && <p class="st-error">{err}</p>}
      </div>

      <Modal open={!!menu} onClose={() => setMenu(null)} title={menu ? `${menu.icon} ${menu.name}` : ''} subtitle={menu ? fnDef(menu.fn).label : ''} size="sm">
        {menu && (
          <div class="st-menu">
            <Button block variant="primary" icon="build" onClick={() => (setMenu(null), st.placeDesign(menu.id))}>
              Place in the city
            </Button>
            <Button block variant="secondary" icon="edit" onClick={() => (setMenu(null), st.open(menu.id, { tab: 'parts' }))}>
              Edit design
            </Button>
            <Button block variant="secondary" icon="copy" onClick={() => (setMenu(null), st.duplicateDesign(menu.id))}>
              Duplicate
            </Button>
            <Button block variant="secondary" icon="share" onClick={() => (setMenu(null), openShare(menu))}>
              Share code
            </Button>
            <Button
              block
              variant="danger"
              icon="trash"
              onClick={() => {
                const d = menu;
                setMenu(null);
                void st.deleteDesign(d.id);
              }}
            >
              Delete…
            </Button>
          </div>
        )}
      </Modal>

      <Modal open={!!share} onClose={() => setShare(null)} title="Share code" subtitle={share?.name} icon="share" size="sm">
        {share && (
          <div class="st-share">
            <p class="st-note">Anyone can paste this into their Architect Studio to get a copy of your design.</p>
            <textarea class="st-code num" readOnly value={share.code} rows={5} onFocus={(e) => (e.currentTarget as HTMLTextAreaElement).select()} />
            <Button
              block
              variant="primary"
              icon="copy"
              onClick={() => {
                void copyText(share.code).then((ok) => {
                  uiSound(ok ? 'chime' : 'error');
                  notify(ok ? { title: 'Copied to clipboard', kind: 'good', icon: 'copy' } : { title: 'Copy failed', body: 'Select the code and copy it manually.', kind: 'warn', icon: 'copy' });
                });
              }}
            >
              Copy code
            </Button>
            <Chip size="sm" icon="info">
              {share.code.length.toLocaleString()} characters
            </Chip>
          </div>
        )}
      </Modal>
    </div>
  );
}
