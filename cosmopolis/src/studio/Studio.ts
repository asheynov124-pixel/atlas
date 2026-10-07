/**
 * OWNER: studio.
 * Studio — the Architect Studio system: design your own buildings from 43 kinds of parts, preview them on a
 * pedestal in space (StudioView), save them as real catalog items (category 'custom', group 'My Designs') that you
 * place in your city like anything else.
 *
 *   open(editId?, o?)  switch to the studio view (game.setView(studioView)); edits a saved design or starts from a
 *                      template (default Neo Tower). Pauses the clock while you design; close() restores it and
 *                      returns via game.showPlanet().
 *   Editing            mutate(fn, key) is the single entry point (undo/redo with coalescing, dirty flag, live
 *                      preview); helpers: addPart · removePart · duplicatePart · movePart · reorder · updatePart ·
 *                      setFootprint (rescales the plan) · loadTemplate · surprise · blank · optimise.
 *   Saving             save() validates the triangle budget, derives balanced stats from the function & size
 *                      (stats.ts), stores the JSON spec in empire.s.customItems, registers the ItemDef
 *                      (id "custom_<id>", tier 0, mesh = the same builder), clears cached geometry + refreshes the
 *                      BuildingRenderer pool, bumps ui.catalogVersion and emits 'catalog:changed'.
 *   Designs            duplicateDesign · deleteDesign (placed copies keep standing: the def is retired, hidden) ·
 *                      exportCode / importCode (share codes, codec.ts) · placeDesign (pick it up with the plop tool).
 *   Library            every design you save is also kept in a device library (localStorage) so you can bring it
 *                      into any other city; library designs are pre-registered hidden so old saves always resolve.
 *   loadFromEmpire()   re-registers this save's designs (called by Game on new game / load); onPlanetLoaded also
 *                      repairs footprints of custom buildings deserialised before their def existed.
 *
 * URL hooks: &studio=1 (open) · &studioTpl=<templateId|surprise|blank> · &studioTab=parts|edit|templates|save ·
 *   &studioNight=1 · &studioSel=<part index> · &studioDemo=1 (saves three templates and places them near the camera
 *   with game.ops.placeBuilding — screenshot tests) · &studioFp=1|7|19.
 * Test hook: game.studio.selfTest() → { templates, parts, maxTriangles, errors } (builds every template & part).
 *
 * CONTRACT: open(editId?), close(), isOpen, loadFromEmpire(), customDefs()
 */
import { clearGeometryCache, getItem, registerItems, unregisterItem, type ItemDef } from '../content/catalog';
import { bus } from '../core/events';
import type { Game } from '../game/Game';
import type { System } from '../game/System';
import { prewarmThumbnails } from '../render/Thumbnails';
import { confirmDialog, notify, ui } from '../ui/store';
import type { Planet } from '../world/planet';
import { addContext, analyze, buildDesign, simplify, TRI_BUDGET } from './builder';
import { decodeDesign, encodeDesign } from './codec';
import {
  cleanText,
  cloneDesign,
  CUSTOM_PREFIX,
  defIdOf,
  designIdOf,
  footprintRadius,
  LIMITS,
  newDesignId,
  normalizeDesign,
  normalizePart,
  type DesignSpec,
  type FnId,
  type Footprint,
  type PartSpec,
  type PartType,
} from './model';
import { createPart, PART_LIST } from './parts';
import { studioUi, type StudioTab } from './state';
import { deriveStats, flavorFor, fnDef, measure } from './stats';
import { StudioView } from './StudioView';
import { blankDesign, designFromTemplate, surpriseDesign, templateById, TEMPLATES } from './templates';

const LIBRARY_KEY = 'cosmopolis.studio.library.v1';
const LIBRARY_MAX = 80;
const UNDO_MAX = 80;

interface StudioExt {
  retired?: unknown[];
}

export class Studio implements System {
  isOpen = false;
  view: StudioView | null = null;
  /** def ids we registered → signature (skip identical re-registrations) */
  private registered = new Map<string, string>();
  private visibleDefs = new Map<string, ItemDef>();
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private lastKey = '';
  private lastTime = 0;
  private prevSpeed = 1;
  private urlDone = false;
  private surpriseSeed = Math.floor(Math.random() * 1e6);
  private templatesRegistered = false;

  constructor(private game: Game) {}

  init(): void {
    // pre-register the device library (hidden) so any save that uses those designs resolves footprints & meshes
    try {
      for (const d of this.readLibrary()) this.register(d, true);
    } catch (e) {
      console.warn('[studio] library unavailable', e);
    }
  }

  onPlanetLoaded(planet: Planet): void {
    try {
      this.syncEmpire();
      this.repairFootprints(planet);
    } catch (e) {
      console.error('[studio] planet sync failed', e);
    }
    if (!this.urlDone) {
      this.urlDone = true;
      setTimeout(() => this.urlHooks(), 0);
    }
  }

  onPlanetUnloading(): void {
    if (this.isOpen) this.close(true);
  }

  update(): void {
    const v = this.view;
    if (!this.isOpen || !v) return;
    if (studioUi.triangles.value !== v.triangles) studioUi.triangles.value = v.triangles;
    const h = Math.round(v.height * 100) / 100;
    if (studioUi.height.value !== h) studioUi.height.value = h;
  }

  dispose(): void {
    this.view?.dispose();
    this.view = null;
  }

  // ═══════════════════════════════════════════ open / close

  /** Open the studio: edit a saved design (`editId` = design id or "custom_<id>") or start from a template. */
  open(editId?: string, o: { template?: string; design?: DesignSpec; tab?: StudioTab } = {}): void {
    const g = this.game;
    if (!g.planet || !g.planetView) {
      notify({ title: 'Architect Studio', body: 'Start or load a city first.', kind: 'info', icon: 'custom' });
      return;
    }
    let draft: DesignSpec | null = null;
    let editing: string | null = null;
    const id = editId ? designIdOf(editId) ?? editId : null;
    if (id) {
      const found = this.findDesign(id);
      if (found) {
        draft = cloneDesign(found);
        editing = found.id;
      }
    }
    if (!draft && o.design) draft = cloneDesign(o.design);
    if (!draft) draft = this.fromTemplateId(o.template ?? 'neo-tower');
    if (!this.view) this.view = new StudioView();
    try {
      this.ensureTemplateDefs();
      prewarmThumbnails(TEMPLATES.map((t) => this.templateDefId(t.id)));
    } catch (e) {
      console.warn('[studio] template previews unavailable', e);
    }
    // tools / panels / selection out of the way
    try {
      g.tools.select(null);
    } catch {
      /* tools optional */
    }
    ui.panel.value = null;
    ui.category.value = null;
    ui.selection.value = null;
    if (!this.isOpen) {
      this.prevSpeed = g.clock.speed;
      g.clock.setSpeed(0);
    }
    this.isOpen = true;
    this.undoStack = [];
    this.redoStack = [];
    this.lastKey = '';
    studioUi.editingId.value = editing;
    studioUi.selected.value = -1;
    studioUi.saved.value = null;
    studioUi.dirty.value = false;
    studioUi.tab.value = o.tab ?? (editing ? 'parts' : 'templates');
    this.setDraft(draft, false);
    this.view.setNight(studioUi.night.value, true);
    this.view.setSelected(-1);
    this.view.flush();
    g.setView(this.view);
    this.view.intro();
    studioUi.open.value = true;
    this.publishHistory();
    this.sfx('open');
  }

  /** Leave the studio (asks first when there are unsaved changes, unless `force`). */
  close(force = false): void {
    if (!this.isOpen) return;
    if (!force && studioUi.dirty.value) {
      void confirmDialog({ title: 'Discard changes?', body: 'Your design has unsaved changes.', okLabel: 'Discard', cancelLabel: 'Keep editing', danger: true }).then((ok) => {
        if (ok) this.close(true);
      });
      return;
    }
    this.isOpen = false;
    studioUi.open.value = false;
    studioUi.saved.value = null;
    const g = this.game;
    g.clock.setSpeed(this.prevSpeed);
    if (g.activeView === this.view) g.showPlanet();
    this.sfx('close');
  }

  // ═══════════════════════════════════════════ editing

  get draft(): DesignSpec | null {
    return studioUi.draft.value;
  }

  /**
   * Apply a change to the draft. Edits with the same `key` coalesce into one undo step (a slider drag); `final`
   * closes the step (the slider was released) so the next drag starts a new one. No-op edits are ignored.
   */
  mutate(fn: (d: DesignSpec) => void, key = '', final = false): void {
    const cur = studioUi.draft.value;
    if (!cur) return;
    const next = cloneDesign(cur);
    try {
      fn(next);
    } catch (e) {
      console.error('[studio] edit failed', e);
      return;
    }
    const before = JSON.stringify(cur);
    if (JSON.stringify({ ...next, updated: cur.updated }) === before) {
      if (final) this.lastKey = '';
      return;
    }
    const now = performance.now();
    const coalesce = key !== '' && key === this.lastKey && now - this.lastTime < 1500;
    if (!coalesce) {
      this.undoStack.push(before);
      if (this.undoStack.length > UNDO_MAX) this.undoStack.shift();
      this.redoStack = [];
    }
    this.lastKey = final ? '' : key;
    this.lastTime = now;
    next.updated = Date.now();
    this.setDraft(next, true);
    this.publishHistory();
  }

  undo(): void {
    const s = this.undoStack.pop();
    const cur = studioUi.draft.value;
    if (!s || !cur) return;
    this.redoStack.push(JSON.stringify(cur));
    this.lastKey = '';
    const d = normalizeDesign(JSON.parse(s));
    if (d) this.setDraft(d, true);
    this.publishHistory();
    this.sfx('tap');
  }

  redo(): void {
    const s = this.redoStack.pop();
    const cur = studioUi.draft.value;
    if (!s || !cur) return;
    this.undoStack.push(JSON.stringify(cur));
    this.lastKey = '';
    const d = normalizeDesign(JSON.parse(s));
    if (d) this.setDraft(d, true);
    this.publishHistory();
    this.sfx('tap');
  }

  select(i: number): void {
    const d = studioUi.draft.value;
    const n = d ? d.parts.length : 0;
    const v = i >= 0 && i < n ? i : -1;
    studioUi.selected.value = v;
    this.view?.setSelected(v);
  }

  /** Tap on the stage: select the part under the finger (or clear). Returns the index. */
  pickAt(x: number, y: number): number {
    const i = this.view ? this.view.pick(x, y) : -1;
    this.select(i);
    if (i >= 0) {
      studioUi.pickTick.value++;
      this.sfx('tap');
    }
    return i;
  }

  addPart(t: PartType): void {
    const d = studioUi.draft.value;
    if (!d) return;
    if (d.parts.length >= LIMITS.parts) {
      notify({ title: 'That’s a lot of parts', body: `Designs can have up to ${LIMITS.parts} parts.`, kind: 'warn', icon: 'custom' });
      return;
    }
    const sel = studioUi.selected.value;
    const after = sel >= 0 && sel < d.parts.length ? sel : d.parts.length - 1;
    const part = createPart(t, addContext(d, after));
    const at = after + 1;
    this.mutate((x) => x.parts.splice(at, 0, part));
    this.select(at);
    this.sfx('place');
  }

  removePart(i: number): void {
    const d = studioUi.draft.value;
    if (!d || i < 0 || i >= d.parts.length) return;
    this.mutate((x) => x.parts.splice(i, 1));
    this.select(Math.min(i, (studioUi.draft.value?.parts.length ?? 0) - 1));
    this.sfx('bulldoze');
  }

  duplicatePart(i: number): void {
    const d = studioUi.draft.value;
    if (!d || i < 0 || i >= d.parts.length || d.parts.length >= LIMITS.parts) return;
    const copy = { ...d.parts[i] };
    // free parts step aside so the copy is visible; stacked copies simply stack
    if (!copy.stack) copy.y += Math.max(0.2, copy.h * 0.5);
    this.mutate((x) => x.parts.splice(i + 1, 0, copy));
    this.select(i + 1);
    this.sfx('place');
  }

  movePart(i: number, dir: -1 | 1): void {
    this.reorder(i, i + dir);
  }

  reorder(from: number, to: number): void {
    const d = studioUi.draft.value;
    if (!d || from === to || from < 0 || to < 0 || from >= d.parts.length || to >= d.parts.length) return;
    this.mutate((x) => {
      const [p] = x.parts.splice(from, 1);
      x.parts.splice(to, 0, p);
    });
    this.select(to);
    this.sfx('tap');
  }

  /** Patch one part. `key` groups a drag into one undo step; `final` marks the release. */
  updatePart(i: number, patch: Partial<PartSpec>, key = '', final = false): void {
    const d = studioUi.draft.value;
    if (!d || i < 0 || i >= d.parts.length) return;
    this.mutate(
      (x) => {
        x.parts[i] = normalizePart({ ...x.parts[i], ...patch });
      },
      key ? `p${i}:${key}` : '',
      final,
    );
  }

  /** Change the lot size, scaling every part's plan (and offsets) to match. */
  setFootprint(fp: Footprint): void {
    const d = studioUi.draft.value;
    if (!d || d.footprint === fp) return;
    const k = footprintRadius(fp) / footprintRadius(d.footprint);
    const PLAN = new Set<keyof PartSpec>(['w', 'd', 'x', 'z']);
    this.mutate((x) => {
      x.footprint = fp;
      x.parts = x.parts.map((p) => {
        const q: PartSpec = { ...p };
        for (const key of PLAN) (q[key] as number) = (p[key] as number) * k;
        return normalizePart(q);
      });
    });
    this.sfx('toggle');
  }

  setMeta(patch: Partial<Pick<DesignSpec, 'name' | 'description' | 'icon' | 'fn'>>): void {
    this.mutate((x) => {
      if (patch.name !== undefined) x.name = cleanText(patch.name, 40);
      if (patch.description !== undefined) x.description = cleanText(patch.description, 220);
      if (patch.icon !== undefined) x.icon = cleanText(patch.icon, 8) || x.icon;
      if (patch.fn !== undefined) x.fn = patch.fn as FnId;
    }, patch.name !== undefined ? 'name' : patch.description !== undefined ? 'desc' : '');
  }

  loadTemplate(id: string): void {
    const d = this.fromTemplateId(id);
    this.replaceDraft(d);
    this.sfx('whoosh');
  }

  surprise(): void {
    this.surpriseSeed = (this.surpriseSeed * 16807 + 12345) % 2147483647;
    this.replaceDraft(surpriseDesign(this.surpriseSeed));
    this.sfx('magic');
  }

  blank(fp: Footprint = studioUi.draft.value?.footprint ?? 1): void {
    this.replaceDraft(blankDesign(fp));
    this.sfx('tap');
  }

  /** Reduce detail until under the triangle budget. */
  optimise(): void {
    const d = studioUi.draft.value;
    if (!d) return;
    const s = simplify(d);
    this.mutate((x) => {
      x.parts = s.parts;
    });
    const t = analyze(s).triangles;
    notify({ title: t <= TRI_BUDGET ? 'Optimised' : 'Still very detailed', body: `${t.toLocaleString()} / ${TRI_BUDGET.toLocaleString()} triangles`, kind: t <= TRI_BUDGET ? 'good' : 'warn', icon: 'sparkles' });
  }

  setNight(on: boolean): void {
    studioUi.night.value = on;
    this.view?.setNight(on);
    this.sfx('toggle');
  }

  /** Swap the whole draft (template, surprise, import) keeping the current design identity when editing. */
  private replaceDraft(d: DesignSpec): void {
    const cur = studioUi.draft.value;
    const editing = studioUi.editingId.value;
    this.mutate((x) => {
      const keepId = editing ?? x.id;
      Object.assign(x, cloneDesign(d));
      x.id = keepId;
      if (cur && editing) x.created = cur.created;
    });
    this.select(-1);
  }

  private setDraft(d: DesignSpec, dirty: boolean): void {
    studioUi.draft.value = d;
    if (dirty) studioUi.dirty.value = true;
    if (studioUi.selected.value >= d.parts.length) this.select(d.parts.length - 1);
    this.view?.setDesign(d);
  }

  private publishHistory(): void {
    studioUi.canUndo.value = this.undoStack.length > 0;
    studioUi.canRedo.value = this.redoStack.length > 0;
  }

  private fromTemplateId(id: string): DesignSpec {
    if (id === 'surprise') return surpriseDesign(this.surpriseSeed);
    if (id === 'blank') return blankDesign(1);
    const t = templateById(id) ?? TEMPLATES[0];
    return designFromTemplate(t);
  }

  // ═══════════════════════════════════════════ saving & designs

  /** Validate & save the draft as a catalog item. */
  save(): { ok: true; defId: string } | { ok: false; reason: string } {
    const d0 = studioUi.draft.value;
    if (!d0) return { ok: false, reason: 'Nothing to save.' };
    if (!d0.parts.length) return { ok: false, reason: 'Add at least one part first.' };
    const tris = analyze(d0).triangles;
    if (tris > TRI_BUDGET) return { ok: false, reason: `Too detailed: ${tris.toLocaleString()} of ${TRI_BUDGET.toLocaleString()} triangles. Remove parts, lower counts, or tap Optimise.` };
    const e = this.game.empire;
    const editing = studioUi.editingId.value;
    const d = normalizeDesign({ ...cloneDesign(d0), name: d0.name.trim() || 'Untitled Design', updated: Date.now() });
    if (!d) return { ok: false, reason: 'This design could not be saved.' };
    const list = this.empireDesigns();
    let fresh = true;
    if (editing && list.some((x) => x.id === editing)) {
      d.id = editing;
      fresh = false;
      e.s.customItems = list.map((x) => (x.id === editing ? d : x));
    } else {
      if (list.some((x) => x.id === d.id) || getItem(defIdOf(d.id))?.custom) d.id = newDesignId();
      e.s.customItems = [...list, d];
    }
    // a retired design brought back to life is no longer retired
    this.setRetired(this.retired().filter((x) => x.id !== d.id));
    this.register(d, false);
    this.catalogChanged();
    this.libraryUpsert(d);
    studioUi.draft.value = d;
    studioUi.editingId.value = d.id;
    studioUi.dirty.value = false;
    studioUi.saved.value = { id: d.id, name: d.name, fresh };
    this.refreshLists();
    notify({ title: fresh ? 'Design saved' : 'Design updated', body: `${d.icon} ${d.name} is in Build › My Designs.`, kind: 'good', icon: 'custom' });
    this.sfx(fresh ? 'unlock' : 'chime');
    return { ok: true, defId: defIdOf(d.id) };
  }

  /** Save a copy of a saved design (or of the draft when `id` is omitted). */
  duplicateDesign(id?: string): DesignSpec | null {
    const src = id ? this.findDesign(id) : studioUi.draft.value;
    if (!src) return null;
    const copy = cloneDesign(src);
    copy.id = newDesignId();
    copy.name = (src.name.replace(/\s+(II|III|IV|V|VI|VII|VIII|IX|X)$/, '') + ' ' + nextNumeral(src.name)).slice(0, 40);
    copy.created = copy.updated = Date.now();
    const e = this.game.empire;
    e.s.customItems = [...this.empireDesigns(), copy];
    this.register(copy, false);
    this.catalogChanged();
    this.libraryUpsert(copy);
    this.refreshLists();
    notify({ title: 'Design duplicated', body: copy.name, kind: 'good', icon: 'copy' });
    return copy;
  }

  /** Placed copies anywhere in the empire. */
  placedCount(id: string): number {
    const defId = defIdOf(id);
    let n = 0;
    const cur = this.game.planet;
    if (cur) for (const b of cur.buildings.values()) if (b.defId === defId) n++;
    for (const [pid, save] of Object.entries(this.game.empire.s.planets)) {
      if (cur && pid === cur.spec.id) continue;
      for (const b of save.buildings ?? []) if (b.defId === defId) n++;
    }
    return n;
  }

  /** Delete a design from this city (asks first). Placed copies keep standing. */
  async deleteDesign(id: string, ask = true): Promise<boolean> {
    const d = this.findDesign(id);
    if (!d) return false;
    const placed = this.placedCount(id);
    if (ask) {
      const ok = await confirmDialog({
        title: `Delete “${d.name}”?`,
        body: placed > 0 ? `The ${placed} already built ${placed === 1 ? 'copy stays' : 'copies stay'} standing — you just won’t be able to build more. It stays in your device library.` : 'It stays in your device library, so you can bring it back later.',
        okLabel: 'Delete',
        danger: true,
      });
      if (!ok) return false;
    }
    const e = this.game.empire;
    e.s.customItems = this.empireDesigns().filter((x) => x.id !== id);
    if (placed > 0) {
      this.setRetired([...this.retired().filter((x) => x.id !== id), d]);
      this.register(d, true);
    } else this.unregister(defIdOf(id));
    this.catalogChanged();
    this.refreshLists();
    if (studioUi.editingId.value === id) studioUi.editingId.value = null;
    this.sfx('demolish');
    return true;
  }

  /** Bring a library design into this city (saved). */
  adoptFromLibrary(id: string): DesignSpec | null {
    const lib = this.readLibrary().find((x) => x.id === id);
    if (!lib) return null;
    const d = cloneDesign(lib);
    if (this.findDesign(d.id)) return this.findDesign(d.id);
    const e = this.game.empire;
    e.s.customItems = [...this.empireDesigns(), d];
    this.setRetired(this.retired().filter((x) => x.id !== d.id));
    this.register(d, false);
    this.catalogChanged();
    this.refreshLists();
    notify({ title: 'Added to this city', body: `${d.icon} ${d.name}`, kind: 'good', icon: 'download' });
    this.sfx('unlock');
    return d;
  }

  removeFromLibrary(id: string): void {
    this.writeLibrary(this.readLibrary().filter((x) => x.id !== id));
    // keep the hidden def only if something still references it
    if (!this.findDesign(id) && !this.retired().some((x) => x.id === id) && this.placedCount(id) === 0) this.unregister(defIdOf(id));
    this.refreshLists();
  }

  /** Share code for a design (saved id, or the draft). */
  exportCode(id?: string): string {
    const d = id ? this.findDesign(id) ?? this.readLibrary().find((x) => x.id === id) : studioUi.draft.value;
    return d ? encodeDesign(d) : '';
  }

  /** Load a share code into the editor as a new, unsaved design. */
  importCode(code: string): { ok: boolean; error?: string } {
    const r = decodeDesign(code);
    if (!r.ok) return { ok: false, error: r.error };
    const d = r.design;
    d.id = newDesignId();
    d.created = d.updated = Date.now();
    studioUi.editingId.value = null;
    this.mutate((x) => Object.assign(x, d));
    this.select(-1);
    studioUi.tab.value = 'parts';
    notify({ title: 'Design imported', body: `${d.icon} ${d.name} — save it to build it.`, kind: 'good', icon: 'download' });
    this.sfx('magic');
    return { ok: true };
  }

  /** Leave the studio holding the design, ready to place. */
  placeDesign(id: string): void {
    const defId = defIdOf(id);
    const def = getItem(defId);
    if (!def) return;
    this.close(true);
    try {
      this.game.tools.select({ id: 'plop', itemId: defId, label: def.name });
    } catch (e) {
      console.error('[studio] place failed', e);
    }
  }

  // ═══════════════════════════════════════════ registration

  /** Re-register every design of the current empire (Game calls this on new game / load). */
  loadFromEmpire(): void {
    try {
      this.syncEmpire();
      if (this.game.planet) this.repairFootprints(this.game.planet);
    } catch (e) {
      console.error('[studio] loadFromEmpire failed', e);
    }
  }

  /** Visible custom ItemDefs of this city. */
  customDefs(): ItemDef[] {
    return [...this.visibleDefs.values()];
  }

  /** Catalog id of a template's (hidden) preview def — for 3D thumbnails in the Templates tab. */
  templateDefId(id: string): string {
    return 'studio_tpl_' + id;
  }

  /** Register hidden preview defs for every template (once). */
  ensureTemplateDefs(): void {
    if (this.templatesRegistered) return;
    this.templatesRegistered = true;
    const defs: ItemDef[] = TEMPLATES.map((t) => {
      const spec = designFromTemplate(t);
      return {
        id: this.templateDefId(t.id),
        name: t.name,
        category: 'custom',
        group: 'Studio templates',
        description: t.blurb,
        icon: t.icon,
        footprint: t.footprint,
        placement: 'surface',
        cost: 0,
        upkeep: 0,
        tier: 0,
        hidden: true,
        height: analyze(spec).height,
        custom: { template: t.id },
        mesh: (ctx) => {
          buildDesign(ctx.b, spec);
        },
      };
    });
    registerItems(defs);
  }

  /** Saved designs of this city (normalised). */
  designs(): DesignSpec[] {
    return this.empireDesigns();
  }

  private syncEmpire(): void {
    const list = this.empireDesigns();
    const retired = this.retired();
    const library = this.readLibrary();
    const want = new Map<string, { d: DesignSpec; hidden: boolean }>();
    for (const d of library) want.set(d.id, { d, hidden: true });
    for (const d of retired) want.set(d.id, { d, hidden: true });
    for (const d of list) want.set(d.id, { d, hidden: false });
    let changed = false;
    for (const defId of [...this.registered.keys()]) {
      const id = defId.slice(CUSTOM_PREFIX.length);
      if (!want.has(id)) {
        this.unregister(defId, false);
        changed = true;
      }
    }
    for (const { d, hidden } of want.values()) if (this.register(d, hidden, false)) changed = true;
    if (changed) this.catalogChanged();
    this.refreshLists();
  }

  /** Register / refresh a design's ItemDef. Returns true when something changed. */
  private register(d: DesignSpec, hidden: boolean, refresh = true): boolean {
    const defId = defIdOf(d.id);
    const sig = `${d.updated}|${hidden ? 1 : 0}|${d.parts.length}|${d.name}|${d.fn}|${d.footprint}`;
    if (this.registered.get(defId) === sig && getItem(defId)) return false;
    const def = this.makeDef(d, hidden);
    clearGeometryCache(defId + '|');
    registerItems([def]);
    this.registered.set(defId, sig);
    if (hidden) this.visibleDefs.delete(defId);
    else this.visibleDefs.set(defId, def);
    try {
      this.game.planetView?.buildings.pool.refreshGeometry(defId + '|');
    } catch (e) {
      console.warn('[studio] pool refresh failed', e);
    }
    if (refresh) this.catalogChanged();
    return true;
  }

  private unregister(defId: string, emit = true): void {
    unregisterItem(defId);
    clearGeometryCache(defId + '|');
    this.registered.delete(defId);
    this.visibleDefs.delete(defId);
    if (emit) this.catalogChanged();
  }

  private makeDef(d: DesignSpec, hidden: boolean): ItemDef {
    const spec = cloneDesign(d);
    const m = measure(spec);
    const st = deriveStats(spec, m);
    const fn = fnDef(spec.fn);
    return {
      id: defIdOf(spec.id),
      name: spec.name,
      category: 'custom',
      group: 'My Designs',
      description: spec.description || `${fn.label} designed in the Architect Studio. ${fn.blurb}`,
      flavor: flavorFor(spec),
      icon: spec.icon || fn.emoji,
      footprint: spec.footprint,
      placement: 'surface',
      cost: st.cost,
      upkeep: st.upkeep,
      tier: 0,
      requires: { road: st.roadNeeded },
      effects: st.effects,
      coverage: st.coverage.length ? st.coverage : undefined,
      height: Math.max(0.2, m.height),
      tags: st.tags,
      hidden: hidden || undefined,
      custom: spec,
      mesh: (ctx) => {
        buildDesign(ctx.b, spec);
      },
    };
  }

  private catalogChanged(): void {
    ui.catalogVersion.value++;
    bus.emit('catalog:changed', {});
  }

  /** Buildings deserialised before their custom def existed got a 1-tile footprint and no mesh — fix them. */
  private repairFootprints(planet: Planet): void {
    for (const b of planet.buildings.values()) {
      if (!b.defId.startsWith(CUSTOM_PREFIX)) continue;
      const def = getItem(b.defId);
      if (!def) continue;
      const want = planet.grid.footprint(b.tile, def.footprint);
      const same = want.length === b.tiles.length && want.every((t) => b.tiles.includes(t));
      if (!same) {
        for (const t of b.tiles) if (planet.building[t] === b.id) planet.building[t] = -1;
        for (const t of want) if (planet.building[t] < 0) planet.building[t] = b.id;
        b.tiles = want.filter((t) => planet.building[t] === b.id);
      }
      bus.emit('building:updated', { id: b.id, what: 'variant' });
    }
  }

  // ═══════════════════════════════════════════ persistence helpers

  private empireDesigns(): DesignSpec[] {
    const raw = this.game.empire?.s.customItems ?? [];
    const out: DesignSpec[] = [];
    const seen = new Set<string>();
    for (const r of raw) {
      const d = normalizeDesign(r);
      if (d && !seen.has(d.id)) {
        seen.add(d.id);
        out.push(d);
      }
    }
    return out;
  }

  private ext(): StudioExt {
    const e = this.game.empire.s;
    const x = (e.ext.studio ?? {}) as StudioExt;
    e.ext.studio = x;
    return x;
  }

  private retired(): DesignSpec[] {
    const raw = this.ext().retired ?? [];
    return raw.map((r) => normalizeDesign(r)).filter((d): d is DesignSpec => !!d);
  }

  private setRetired(list: DesignSpec[]): void {
    this.ext().retired = list;
  }

  private findDesign(id: string): DesignSpec | null {
    return this.empireDesigns().find((d) => d.id === id) ?? null;
  }

  private refreshLists(): void {
    const list = this.empireDesigns();
    studioUi.designs.value = list;
    const ids = new Set(list.map((d) => d.id));
    studioUi.library.value = this.readLibrary().filter((d) => !ids.has(d.id));
  }

  private readLibrary(): DesignSpec[] {
    try {
      const raw = globalThis.localStorage?.getItem(LIBRARY_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.map((r) => normalizeDesign(r)).filter((d): d is DesignSpec => !!d);
    } catch {
      return [];
    }
  }

  private writeLibrary(list: DesignSpec[]): void {
    try {
      globalThis.localStorage?.setItem(LIBRARY_KEY, JSON.stringify(list.slice(-LIBRARY_MAX)));
    } catch {
      /* storage full / unavailable — the library is a convenience */
    }
  }

  private libraryUpsert(d: DesignSpec): void {
    const list = this.readLibrary().filter((x) => x.id !== d.id);
    list.push(cloneDesign(d));
    this.writeLibrary(list);
  }

  private sfx(name: Parameters<Game['audio']['sfx']>[0]): void {
    try {
      this.game.audio.sfx(name);
    } catch {
      /* audio optional */
    }
  }

  // ═══════════════════════════════════════════ URL hooks & tests

  private urlHooks(): void {
    let params: URLSearchParams;
    try {
      params = new URLSearchParams(location.search);
    } catch {
      return;
    }
    try {
      if (params.get('studioDemo') === '1') this.demo();
      if (params.get('studio') === '1') {
        const tpl = params.get('studioTpl') ?? 'neo-tower';
        const tab = params.get('studioTab') as StudioTab | null;
        this.open(undefined, { template: tpl, tab: tab ?? undefined });
        const fp = Number(params.get('studioFp'));
        if (fp === 1 || fp === 7 || fp === 19) this.setFootprint(fp);
        if (params.get('studioNight') === '1') this.setNight(true), this.view?.setNight(true, true);
        if (params.has('studioSel')) this.select(Number(params.get('studioSel')));
        if (tab) studioUi.tab.value = tab;
      }
    } catch (e) {
      console.error('[studio] url hook failed', e);
    }
  }

  /** Save a few templates as designs and place them around the camera target (screenshot / smoke test). */
  demo(ids: string[] = ['neo-tower', 'crystal-spire', 'cyber-block', 'pagoda', 'helix']): string[] {
    const placed: string[] = [];
    for (const id of ids) {
      const t = templateById(id);
      if (!t) continue;
      const d = designFromTemplate(t);
      const e = this.game.empire;
      e.s.customItems = [...this.empireDesigns(), d];
      this.register(d, false, false);
      this.libraryUpsert(d);
      const ok = this.placeNear(defIdOf(d.id));
      if (ok !== null) placed.push(d.id);
    }
    this.catalogChanged();
    this.refreshLists();
    return placed;
  }

  /** Place a def on a free valid tile near the camera target, facing a road. Returns the building id. */
  placeNear(defId: string, maxRadius = 9): number | null {
    const g = this.game;
    const p = g.planet, ops = g.ops;
    if (!p || !ops) return null;
    let center = 0;
    try {
      center = g.camera.targetTile();
    } catch {
      /* default tile 0 */
    }
    for (let r = 0; r <= maxRadius; r++) {
      for (const t of r === 0 ? [center] : p.grid.ring(center, r)) {
        const deg = p.grid.degree(t);
        let rot = 0;
        for (let k = 0; k < deg; k++)
          if (p.road[p.grid.neighbor(t, k)] !== 0) {
            rot = k;
            break;
          }
        if (!ops.checkPlace(defId, t, rot).ok) continue;
        const b = ops.placeBuilding(defId, t, rot);
        if (b) return b.id;
      }
    }
    return null;
  }

  /** Build every template and every part type; report triangle counts & failures (dev / tests). */
  selfTest(): { templates: number; parts: number; maxTriangles: number; errors: string[] } {
    const errors: string[] = [];
    let max = 0;
    for (const t of TEMPLATES) {
      try {
        const a = analyze(designFromTemplate(t));
        max = Math.max(max, a.triangles);
        if (a.triangles > TRI_BUDGET) errors.push(`${t.id}: ${a.triangles} triangles`);
      } catch (e) {
        errors.push(`${t.id}: ${(e as Error).message}`);
      }
    }
    for (const def of PART_LIST) {
      try {
        const d = blankDesign(7);
        d.parts.push(createPart(def.t, addContext(d)));
        if (analyze(d).triangles <= analyze(blankDesign(7)).triangles) errors.push(`${def.t}: no geometry`);
      } catch (e) {
        errors.push(`${def.t}: ${(e as Error).message}`);
      }
    }
    for (let s = 1; s <= 25; s++) {
      const a = analyze(surpriseDesign(s));
      max = Math.max(max, a.triangles);
      if (a.triangles > TRI_BUDGET) errors.push(`surprise ${s}: ${a.triangles}`);
    }
    return { templates: TEMPLATES.length, parts: PART_LIST.length, maxTriangles: max, errors };
  }
}

function nextNumeral(name: string): string {
  const order = ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  const m = name.match(/\s+(II|III|IV|V|VI|VII|VIII|IX|X)$/);
  if (!m) return 'II';
  const i = order.indexOf(m[1]);
  return order[Math.min(order.length - 1, i + 1)];
}
