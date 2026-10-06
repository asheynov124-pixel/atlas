/**
 * OWNER: cosmos agent.
 * Progression — career milestones (population tiers with names: Outpost → Galactic Civilisation, each also gated by a
 * signature goal), 64 side goals / achievements with rewards, unlock rules for items / planets / systems / galaxies /
 * god powers, the research tech tree (30 techs, see techs.ts), monthly tech dividends, colony "settlers' grants",
 * rewards and celebrations. Sandbox: everything unlocked, every tech active, achievements still tracked.
 *
 * CONTRACT
 *   isItemUnlocked(def) · lockReason(def) · tierName(t) · isUnlocked(id) ('planet:'/'system:'/'galaxy:'/'power:'/…)
 *   goals: GoalView[] (also published to ui.goals ≈ 2 Hz: next tier milestone + colony grants + 3 active goals +
 *          goals completed in the last few seconds so the Celebration can find them)
 *   getAllGoals() → every goal (tiers, colony grants, achievements) for the goals panel (also a module export)
 *   techs (TechDef[]) · research(techId) → boolean · canResearch(techId) · techState(techId)
 *   techBonus(key) → multiplier (1 = none; additive keys return 1 + sum) · techAdd(key) → additive sum
 *   techMods() → Partial<sim Mods> ready for the sim's applyPatch (contract request: sim merges it)
 *   checkReq(req) → { ok, label, have, need, waived } · reqsFor(planet|system|galaxy) — used by Cosmos & UI
 *   update(dt)
 * Module exports: TIER_NAMES, TIER_POP, techBonus(key), techMods(), getAllGoals().
 *
 * Events: emits 'unlock' (tier / planet / system / galaxy / tech — cosmos kinds carry the DISPLAY NAME as id so the
 * shell celebration reads nicely), 'milestone:reached' (major goals), toasts via notify, sfx via game.audio.
 * Counters (empire.s.counters, prefix 'cosmos.'): powers, power.<id>, survived, survived.<kind>, planetEnding, pink,
 * renamed, photos, mapOpened, universeOpened, forged.
 */
import type { Game } from '../game/Game';
import type { System } from '../game/System';
import { allItems, catalogVersion, getItem, type ItemDef } from '../content/catalog';
import { bus } from '../core/events';
import type { PlanetTypeId } from '../core/types';
import { notify, ui, type GoalView } from '../ui/store';
import { game as liveGame } from '../game/instance';
import { CATEGORY_INFO, GOALS, TIERS, TIER_NAMES as NAMES, TIER_POP as POPS, type GoalCtx, type GoalDef, type Reward } from './goals';
import { ADDITIVE_KEYS, SIM_KEYS, TECHS, TECH_MAP, type TechDef } from './techs';
import { findGalaxy, findPlanet, findSystem, idParts, type Galaxy, type PlanetEntry, type StarSystem } from './Universe';

export const TIER_NAMES = NAMES;
export const TIER_POP = POPS;

export type ProgressTag = 'spaceport' | 'warpgate' | 'intergalactic' | 'ring';

/** Item classifiers for progression tags (tags first, then id / group heuristics like the sim). */
const TAG_TESTS: Record<ProgressTag, (d: ItemDef) => boolean> = {
  spaceport: (d) => !!d.tags?.includes('spaceport') || /spaceport|starport/i.test(`${d.id} ${d.group ?? ''}`),
  warpgate: (d) => !!d.tags?.some((t) => t === 'warpgate' || t === 'stargate') || /warp.?gate|stargate|jump.?gate/i.test(d.id),
  intergalactic: (d) => !!d.tags?.includes('intergalactic') || /intergalactic/i.test(d.id),
  ring: (d) => !!d.tags?.some((t) => t === 'ring' || t === 'orbital-ring' || t === 'orbitalring') || (d.category === 'orbital' && /ring/i.test(d.id)),
};
const TAGS: ProgressTag[] = ['spaceport', 'warpgate', 'intergalactic', 'ring'];
/** Progression keys open automatically at these tiers, whatever their catalog tier (never block the ladder). */
const KEY_ITEM_TIER: Partial<Record<ProgressTag, number>> = { spaceport: 3, warpgate: 6, intergalactic: 8 };
const TAG_LABEL: Record<ProgressTag, string> = { spaceport: 'Build a spaceport', warpgate: 'Build a warp gate', intergalactic: 'Build an intergalactic gate', ring: 'Build an orbital ring' };

export interface ReqStatus {
  req: string;
  ok: boolean;
  label: string;
  have?: number;
  need?: number;
  /** requirement waived (e.g. no such building exists in this build) */
  waived?: boolean;
}

export interface ExtGoalView extends GoalView {
  category: string;
  icon: string;
  kind: 'tier' | 'goal' | 'colony';
  secret?: boolean;
  major?: boolean;
}

interface ColonyGrant {
  planetId: string;
  name: string;
  target: number;
  money: number;
  paid: boolean;
}

interface CosmosExt {
  primed?: boolean;
  grants?: ColonyGrant[];
  colonyTags?: Record<string, Partial<Record<ProgressTag, number>>>;
  colonyOrbitals?: Record<string, number>;
  lastDividend?: { money: number; research: number; day: number };
  forged?: unknown[];
  [k: string]: unknown;
}

const fmtN = (n: number) => Math.round(n).toLocaleString('en-US');
const fmtK = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}k` : `${Math.round(n)}`);

function isPink(c: number): boolean {
  const r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  if (d < 0.12 || l < 0.35) return false;
  let h = 0;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return h >= 290 || h <= 12;
}

export function rewardText(r: Reward, mult = 1, sandbox = false): string {
  if (sandbox) return '';
  const parts: string[] = [];
  if (r.money) parts.push(`+₡${fmtN(r.money * mult)}`);
  if (r.research) parts.push(`+${fmtN(r.research * mult)} research`);
  return parts.join(' · ');
}

export class Progression implements System {
  readonly techs: TechDef[] = TECHS;
  goals: GoalView[] = [];
  private empireRef: unknown = null;
  private evalTimer = 0.3;
  private tagTimer = 0;
  private activeTags: Record<ProgressTag, number> = { spaceport: 0, warpgate: 0, intergalactic: 0, ring: 0 };
  private activeStyles = 0;
  private tagAvailCache = new Map<ProgressTag, boolean>();
  private tagAvailVersion = -1;
  private bonus = new Map<string, number>();
  private bonusDirty = true;
  private recentDone: { id: string; at: number }[] = [];
  private toastQueue: { title: string; body?: string; icon: string; kind: 'good' | 'milestone' | 'info' }[] = [];
  private toastTimer = 0;
  private goalSig = '';
  private offs: (() => void)[] = [];
  private ctx: GoalCtx;

  constructor(private game: Game) {
    this.ctx = this.makeCtx();
  }

  // ───────────────────────────── lifecycle

  init(): void {
    const g = this.game;
    this.offs.push(
      bus.on('disaster:start', ({ powerId }) => this.onPower(powerId)),
      bus.on('disaster:end', ({ powerId }) => this.onSurvive(powerId)),
      bus.on('building:updated', ({ id, what }) => {
        const b = g.planet?.buildings.get(id);
        if (!b) return;
        if (what === 'tint' && b.tint !== undefined && isPink(b.tint)) this.bump('cosmos.pink');
        if (what === 'name' && b.name) this.bump('cosmos.renamed');
      }),
      bus.on('photo:capture', () => this.bump('cosmos.photos')),
      bus.on('view:changed', ({ view }) => {
        if (view === 'system' || view === 'galaxy' || view === 'universe') this.bump('cosmos.mapOpened');
        if (view === 'universe') this.bump('cosmos.universeOpened');
      }),
      bus.on('planet:loaded', ({ planet }) => this.onLanded(planet.spec.id)),
      bus.on('sim:month', () => this.monthly()),
      bus.on('catalog:changed', () => (this.tagAvailVersion = -1)),
    );
  }

  dispose(): void {
    this.offs.forEach((o) => o());
    this.offs = [];
  }

  onPlanetLoaded(): void {
    this.tagTimer = 0;
    this.evalTimer = 0.5;
  }

  onPlanetUnloading(planet: { spec: { id: string } }): void {
    // snapshot progression-relevant counts of the colony we are leaving
    this.countActive();
    const ext = this.ext();
    ext.colonyTags = ext.colonyTags ?? {};
    ext.colonyTags[planet.spec.id] = { ...this.activeTags };
    ext.colonyOrbitals = ext.colonyOrbitals ?? {};
    ext.colonyOrbitals[planet.spec.id] = this.game.planet?.orbitals.size ?? 0;
  }

  update(dt: number): void {
    const g = this.game;
    if (this.empireRef !== g.empire) this.resetForEmpire();
    if (!g.planet || ui.screen.value !== 'game') return;
    if ((this.tagTimer -= dt) <= 0) {
      this.tagTimer = 2;
      this.countActive();
    }
    if ((this.evalTimer -= dt) <= 0) {
      this.evalTimer = 0.5;
      try {
        this.evaluate();
      } catch (e) {
        console.error('[progression] evaluate failed', e);
      }
    }
    if (this.toastQueue.length && (this.toastTimer -= dt) <= 0) {
      this.toastTimer = 3.2;
      const t = this.toastQueue.shift()!;
      const more = this.toastQueue.length;
      if (more >= 3) {
        // coalesce bursts (e.g. an instant city completes many goals at once)
        this.toastQueue = [];
        notify({ title: t.title, body: `${t.body ? t.body + ' · ' : ''}+${more} more goals completed`, icon: t.icon, kind: t.kind });
      } else notify({ title: t.title, body: t.body, icon: t.icon, kind: t.kind });
      g.audio.sfx('chime');
    }
  }

  private resetForEmpire(): void {
    this.empireRef = this.game.empire;
    this.bonusDirty = true;
    this.recentDone = [];
    this.toastQueue = [];
    this.goalSig = '';
    this.activeTags = { spaceport: 0, warpgate: 0, intergalactic: 0, ring: 0 };
  }

  // ───────────────────────────── state helpers

  private ext(): CosmosExt {
    const e = this.game.empire.s;
    if (!e.ext.cosmos || typeof e.ext.cosmos !== 'object') e.ext.cosmos = {};
    return e.ext.cosmos as CosmosExt;
  }

  private bump(name: string, by = 1): void {
    this.game.empire.bump(name, by);
  }

  private counter(name: string): number {
    return this.game.empire.s.counters[name] ?? 0;
  }

  private get galaxies(): Galaxy[] {
    return this.game.cosmos?.galaxies ?? [];
  }

  // ───────────────────────────── event hooks

  private onPower(powerId: string): void {
    const id = String(powerId).toLowerCase();
    this.bump('cosmos.powers');
    this.bump('cosmos.power.' + id);
    for (const k of ['tornado', 'meteor', 'tsunami', 'rewind', 'chrono', 'blackhole', 'kaiju', 'volcano', 'quake']) if (id.includes(k) && id !== k) this.bump('cosmos.power.' + (k === 'chrono' ? 'rewind' : k));
    if (id.includes('chrono') && !id.includes('rewind')) this.bump('cosmos.power.rewind');
    const def = (this.game.god?.powers ?? []).find((p) => p.id === powerId);
    if (def?.planetEnding) this.bump('cosmos.planetEnding');
  }

  private onSurvive(powerId: string): void {
    const pop = this.metric('population');
    if (!this.game.planet || pop <= 0) return;
    const def = (this.game.god?.powers ?? []).find((p) => p.id === powerId);
    if (def?.planetEnding) return;
    const id = String(powerId).toLowerCase();
    this.bump('cosmos.survived');
    for (const k of ['meteor', 'tsunami', 'tornado', 'quake', 'volcano', 'flood', 'fire', 'kaiju']) if (id.includes(k)) this.bump('cosmos.survived.' + k);
    if (id.includes('asteroid')) this.bump('cosmos.survived.meteor');
  }

  private onLanded(planetId: string): void {
    const e = this.game.empire.s;
    const sys = this.game.cosmos?.systemOf?.(planetId);
    if (sys) {
      if (!e.visited.includes('system:' + sys.id)) e.visited.push('system:' + sys.id);
      if (!e.visited.includes('galaxy:' + sys.galaxyId)) e.visited.push('galaxy:' + sys.galaxyId);
    }
  }

  // ───────────────────────────── metrics & context

  private metric(id: string): number {
    try {
      const sim = this.game.sim;
      if (sim && typeof sim.getMetric === 'function') {
        const v = sim.getMetric(id as never);
        if (Number.isFinite(v) && (v !== 0 || id in (sim.stats ?? {}))) return v;
      }
    } catch {
      /* sim optional */
    }
    return ui.stats.value[id] ?? 0;
  }

  /** Every colony id (planets ever entered) incl. the active one. */
  colonyIds(): string[] {
    const e = this.game.empire.s;
    const ids = new Set(Object.keys(e.planets));
    if (this.game.planet) ids.add(this.game.planet.spec.id);
    return [...ids];
  }

  private specOf(id: string): { type: PlanetTypeId; tags?: string[] } | null {
    if (this.game.planet?.spec.id === id) return this.game.planet.spec;
    return this.game.empire.s.planets[id]?.spec ?? findPlanet(this.galaxies, id)?.spec ?? null;
  }

  totalPop(): number {
    const cur = this.game.planet?.spec.id;
    let total = this.metric('population');
    for (const c of Object.values(this.game.empire.s.colonies ?? {})) if (c && c.planetId !== cur) total += c.population || 0;
    return total;
  }

  private systemIdOf(planetId: string): string | null {
    const sys = this.game.cosmos?.systemOf?.(planetId);
    return sys?.id ?? idParts(planetId)?.system ?? null;
  }

  private galaxyIdOf(planetId: string): string | null {
    const sys = this.game.cosmos?.systemOf?.(planetId);
    return sys?.galaxyId ?? idParts(planetId)?.galaxy ?? null;
  }

  coloniesInGalaxy(gid: string): number {
    return this.colonyIds().filter((id) => this.galaxyIdOf(id) === gid).length;
  }

  private countActive(): void {
    const p = this.game.planet;
    const t: Record<ProgressTag, number> = { spaceport: 0, warpgate: 0, intergalactic: 0, ring: 0 };
    if (!p) {
      this.activeTags = t;
      return;
    }
    const styles = new Set<string>();
    const memo = new Map<string, number>();
    const flags = (defId: string): number => {
      let f = memo.get(defId);
      if (f !== undefined) return f;
      f = 0;
      const d = getItem(defId);
      if (d) TAGS.forEach((tag, i) => (f! |= TAG_TESTS[tag](d) ? 1 << i : 0));
      memo.set(defId, f);
      return f;
    };
    for (const b of p.buildings.values()) {
      const f = flags(b.defId);
      if (f) TAGS.forEach((tag, i) => (t[tag] += f & (1 << i) ? 1 : 0));
      if (!getItem(b.defId)?.growable) styles.add(b.style);
      else styles.add(b.style);
    }
    for (const o of p.orbitals.values()) {
      const f = flags(o.defId);
      if (f) TAGS.forEach((tag, i) => (t[tag] += f & (1 << i) ? 1 : 0));
    }
    this.activeTags = t;
    this.activeStyles = styles.size;
  }

  tagCount(tag: ProgressTag): number {
    const cur = this.game.planet?.spec.id;
    let n = this.activeTags[tag] ?? 0;
    const ct = this.ext().colonyTags ?? {};
    for (const id in ct) if (id !== cur) n += ct[id]?.[tag] ?? 0;
    return n;
  }

  tagAvailable(tag: ProgressTag): boolean {
    const v = catalogVersion();
    if (v !== this.tagAvailVersion) {
      this.tagAvailVersion = v;
      this.tagAvailCache.clear();
      const items = allItems();
      for (const t of TAGS) this.tagAvailCache.set(t, items.some((d) => TAG_TESTS[t](d)));
    }
    return this.tagAvailCache.get(tag) ?? false;
  }

  private makeCtx(): GoalCtx {
    const self = this;
    return {
      get sandbox() {
        return self.game.empire.sandbox;
      },
      get tier() {
        return self.game.empire.s.tier;
      },
      metric: (id) => self.metric(id),
      totalPop: () => self.totalPop(),
      colonies: () => self.colonyIds().length,
      coloniesOfType: (t) => self.colonyIds().filter((id) => self.specOf(id)?.type === t && !(self.specOf(id)?.tags ?? []).includes('giant')).length,
      moonColonies: () => self.colonyIds().filter((id) => /\.m\d+$/.test(id) || (self.specOf(id)?.tags ?? []).includes('moon')).length,
      systemsColonised: () => new Set(self.colonyIds().map((id) => self.systemIdOf(id)).filter(Boolean)).size,
      galaxiesColonised: () => new Set(self.colonyIds().map((id) => self.galaxyIdOf(id)).filter(Boolean)).size,
      galaxiesVisited: () => Math.max(1, self.game.empire.s.visited.filter((v) => v.startsWith('galaxy:')).length),
      blackHoleVisited: () => self.game.empire.s.visited.some((v) => v.startsWith('system:') && findSystem(self.galaxies, v.slice(7))?.star === 'blackhole'),
      tagCount: (t) => self.tagCount(t),
      tagAvailable: (t) => self.tagAvailable(t),
      counter: (n) => self.counter(n),
      techs: () => self.researchedCount(),
      techTotal: () => TECHS.length,
      orbitals: () => {
        const cur = self.game.planet?.spec.id;
        let n = self.game.planet?.orbitals.size ?? 0;
        const co = self.ext().colonyOrbitals ?? {};
        for (const id in co) if (id !== cur) n += co[id] ?? 0;
        return n;
      },
      stylesUsed: () => self.activeStyles,
      customDesigns: () => Math.max((self.game.empire.s.customItems ?? []).length, allItems().filter((d) => d.category === 'custom' && !d.hidden).length),
      money: () => self.game.empire.money,
      days: () => Math.floor(self.game.clock.day),
    };
  }

  // ───────────────────────────── requirements

  checkReq(req: string, galaxyHint?: string): ReqStatus {
    const [kind, a, b] = req.split(':');
    const c = this.ctx;
    const sandbox = this.game.empire.sandbox;
    const done = (ok: boolean, label: string, have?: number, need?: number, waived?: boolean): ReqStatus => ({ req, ok: sandbox || ok, label, have, need, waived });
    switch (kind) {
      case 'tier': {
        const n = Number(a);
        return done(c.tier >= n, `Reach ${TIER_NAMES[n] ?? 'tier ' + n}`, c.tier, n);
      }
      case 'tag': {
        const t = a as ProgressTag;
        if (!this.tagAvailable(t)) return done(true, TAG_LABEL[t] ?? `Build a ${t}`, 1, 1, true);
        const have = this.tagCount(t);
        return done(have >= 1, TAG_LABEL[t] ?? `Build a ${t}`, have, 1);
      }
      case 'colonies': {
        const n = Number(a);
        return done(c.colonies() >= n, `Rule ${n} worlds`, c.colonies(), n);
      }
      case 'pop': {
        const n = Number(a);
        const have = this.totalPop();
        return done(have >= n, `${fmtK(n)} citizens across your empire`, have, n);
      }
      case 'galaxies': {
        const n = Number(a);
        return done(c.galaxiesColonised() >= n, `Colonies in ${n} galaxies`, c.galaxiesColonised(), n);
      }
      case 'visited': {
        const n = Number(a);
        return done(c.galaxiesVisited() >= n, `Land in ${n} galaxies`, c.galaxiesVisited(), n);
      }
      case 'gcol': {
        const gid = a || galaxyHint || '';
        const n = Number(b);
        const have = this.coloniesInGalaxy(gid);
        const gname = findGalaxy(this.galaxies, gid)?.name ?? 'this galaxy';
        return done(have >= n, `${n} ${n === 1 ? 'colony' : 'colonies'} in ${gname}`, have, n);
      }
      case 'goal': {
        const g = GOALS.find((x) => x.id === a);
        return done(this.game.empire.s.goalsDone.includes(a), g ? `Goal: ${g.title}` : `Goal ${a}`);
      }
      default:
        return done(true, req);
    }
  }

  /** Requirement chain for a galaxy / system / planet (outermost first, de-duplicated). */
  reqsFor(target: Galaxy | StarSystem | PlanetEntry): ReqStatus[] {
    const gs = this.galaxies;
    let reqs: string[] = [];
    if ('systems' in target) reqs = target.reqs;
    else if ('planets' in target) reqs = [...(findGalaxy(gs, target.galaxyId)?.reqs ?? []), ...target.reqs];
    else reqs = [...(findGalaxy(gs, target.galaxyId)?.reqs ?? []), ...(findSystem(gs, target.systemId)?.reqs ?? []), ...target.reqs];
    // the highest tier requirement is enough
    const tiers = reqs.filter((r) => r.startsWith('tier:')).map((r) => Number(r.slice(5)));
    const maxTier = tiers.length ? Math.max(...tiers) : -1;
    const seen = new Set<string>();
    const out: ReqStatus[] = [];
    for (const r of reqs) {
      if (r.startsWith('tier:') && Number(r.slice(5)) !== maxTier) continue;
      if (seen.has(r)) continue;
      seen.add(r);
      const gHint = 'systems' in target ? target.id : target.galaxyId;
      out.push(this.checkReq(r, gHint));
    }
    return out;
  }

  /** Are all requirements met for this body (career)? Sandbox: always. */
  meets(target: Galaxy | StarSystem | PlanetEntry): boolean {
    if (this.game.empire.sandbox) return true;
    return this.reqsFor(target).every((r) => r.ok);
  }

  // ───────────────────────────── unlock queries

  isItemUnlocked(def: ItemDef): boolean {
    const e = this.game.empire;
    if (e.sandbox) return true;
    if (def.planetTypes && this.game.planet && !def.planetTypes.includes(this.game.planet.spec.type)) return false;
    const tier = e.s.tier;
    if (def.tier <= tier || e.isUnlocked('item:' + def.id)) return true;
    for (const tag of TAGS) {
      const kt = KEY_ITEM_TIER[tag];
      if (kt !== undefined && tier >= kt && TAG_TESTS[tag](def)) return true;
    }
    for (const id of this.researchedIds()) {
      const t = TECH_MAP.get(id);
      if (t?.unlocks && t.unlocks.test(def, tier)) return true;
    }
    return false;
  }

  lockReason(def: ItemDef): string | null {
    if (this.isItemUnlocked(def)) return null;
    if (def.planetTypes && this.game.planet && !def.planetTypes.includes(this.game.planet.spec.type)) {
      const names = def.planetTypes.map((t) => t[0].toUpperCase() + t.slice(1)).join(' / ');
      return `Only on ${names} worlds`;
    }
    const tech = TECHS.find((t) => t.unlocks && t.unlocks.test(def, 8) && !this.isResearched(t.id));
    const base = `Reach ${TIER_NAMES[def.tier] ?? 'tier ' + def.tier}`;
    return tech && tech.tier <= this.game.empire.s.tier + 1 ? `${base} — or research ${tech.name}` : base;
  }

  isUnlocked(id: string): boolean {
    const e = this.game.empire;
    if (e.sandbox || e.isUnlocked(id)) return true;
    const [kind, ...rest] = id.split(':');
    const key = rest.join(':');
    const gs = this.galaxies;
    switch (kind) {
      case 'tier':
        return e.s.tier >= Number(key);
      case 'planet': {
        const p = findPlanet(gs, key);
        return p ? this.meets(p) : key === this.game.planet?.spec.id;
      }
      case 'system': {
        const s = findSystem(gs, key);
        return s ? this.meets(s) && this.meets(findGalaxy(gs, s.galaxyId)!) : false;
      }
      case 'galaxy': {
        const g = findGalaxy(gs, key);
        return g ? this.meets(g) : false;
      }
      case 'power': {
        const def = (this.game.god?.powers ?? []).find((p) => p.id === key);
        return !def || (def.tier ?? 0) <= e.s.tier;
      }
      case 'tech':
        return this.isResearched(key);
      case 'item': {
        const d = getItem(key);
        return d ? this.isItemUnlocked(d) : false;
      }
      default:
        return false;
    }
  }

  tierName(t: number): string {
    return TIER_NAMES[t] ?? `Tier ${t}`;
  }

  tierInfo(t: number) {
    return TIERS[t];
  }

  // ───────────────────────────── research

  isResearched(id: string): boolean {
    return this.game.empire.sandbox || this.game.empire.s.unlocked.includes('tech:' + id);
  }

  private researchedIds(): string[] {
    if (this.game.empire.sandbox) return TECHS.map((t) => t.id);
    const out: string[] = [];
    for (const u of this.game.empire.s.unlocked) if (u.startsWith('tech:')) out.push(u.slice(5));
    return out;
  }

  researchedCount(): number {
    return this.researchedIds().length;
  }

  techState(id: string): 'done' | 'available' | 'expensive' | 'locked' {
    const t = TECH_MAP.get(id);
    if (!t) return 'locked';
    if (this.isResearched(id)) return 'done';
    const e = this.game.empire;
    if (t.tier > e.s.tier || !t.requires.every((r) => this.isResearched(r))) return 'locked';
    return e.s.research >= t.cost ? 'available' : 'expensive';
  }

  canResearch(id: string): { ok: boolean; reason?: string } {
    const t = TECH_MAP.get(id);
    if (!t) return { ok: false, reason: 'Unknown technology' };
    if (this.isResearched(id)) return { ok: false, reason: 'Already researched' };
    const e = this.game.empire;
    if (t.tier > e.s.tier) return { ok: false, reason: `Reach ${TIER_NAMES[t.tier]}` };
    const missing = t.requires.filter((r) => !this.isResearched(r));
    if (missing.length) return { ok: false, reason: `Needs ${missing.map((m) => TECH_MAP.get(m)?.name ?? m).join(' + ')}` };
    if (e.s.research < t.cost) return { ok: false, reason: `Needs ${fmtN(t.cost - Math.floor(e.s.research))} more research` };
    return { ok: true };
  }

  research(id: string): boolean {
    const chk = this.canResearch(id);
    const t = TECH_MAP.get(id);
    if (!chk.ok || !t) {
      if (chk.reason) notify({ title: 'Cannot research yet', body: chk.reason, kind: 'warn', icon: 'research' });
      this.game.audio.sfx('error');
      return false;
    }
    const e = this.game.empire;
    e.s.research -= t.cost;
    e.unlock('tech:' + id);
    this.bonusDirty = true;
    this.game.audio.sfx('unlock');
    const unlockText = t.unlocks ? ` · ${t.unlocks.label}` : '';
    notify({ title: `${t.name} researched`, body: t.flavor + unlockText, kind: 'good', icon: t.icon });
    bus.emit('unlock', { kind: 'tech', id: t.id });
    if (t.unlocks) bus.emit('catalog:changed', {});
    ui.research.value = Math.floor(e.s.research);
    this.evalTimer = 0;
    return true;
  }

  /** Affordable, unlocked techs (for HUD badges). */
  affordableTechs(): number {
    if (this.game.empire.sandbox) return 0;
    let n = 0;
    for (const t of TECHS) if (this.techState(t.id) === 'available') n++;
    return n;
  }

  private recomputeBonus(): void {
    this.bonus.clear();
    for (const id of this.researchedIds()) {
      const t = TECH_MAP.get(id);
      if (!t) continue;
      for (const ef of t.effects) {
        const cur = this.bonus.get(ef.key);
        if (ADDITIVE_KEYS.has(ef.key)) this.bonus.set(ef.key, (cur ?? 0) + ef.value);
        else this.bonus.set(ef.key, (cur ?? 1) * ef.value);
      }
    }
    this.bonusDirty = false;
  }

  /** Multiplier for a tech effect key (1 = none). Additive keys return 1 + sum. */
  techBonus(key: string): number {
    if (this.empireRef !== this.game.empire) this.resetForEmpire();
    if (this.bonusDirty) this.recomputeBonus();
    const v = this.bonus.get(key);
    if (v === undefined) return 1;
    return ADDITIVE_KEYS.has(key) ? 1 + v : v;
  }

  /** Sum for additive keys (0 = none). */
  techAdd(key: string): number {
    if (this.empireRef !== this.game.empire) this.resetForEmpire();
    if (this.bonusDirty) this.recomputeBonus();
    return ADDITIVE_KEYS.has(key) ? this.bonus.get(key) ?? 0 : (this.bonus.get(key) ?? 1) - 1;
  }

  /** Sim-ready modifier patch (keys match sim/policies Mods). */
  techMods(): Record<string, number> {
    if (this.bonusDirty) this.recomputeBonus();
    const out: Record<string, number> = {};
    for (const k of SIM_KEYS) {
      const v = this.bonus.get(k);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }

  /** Monthly tech dividends (career). */
  private monthly(): void {
    const g = this.game;
    if (g.empire.sandbox || !g.planet) return;
    let money = 0;
    let research = 0;
    const rd = this.techAdd('researchDividend');
    if (rd > 0) research += Math.max(0, this.metric('researchRate')) * rd + 2 * rd * 10;
    const td = this.techAdd('taxDividend');
    if (td > 0) money += Math.max(0, this.metric('monthlyRevenue')) * td;
    const ur = this.techAdd('upkeepRebate');
    if (ur > 0) money += Math.max(0, this.metric('monthlyExpenses')) * ur;
    const ti = this.techAdd('tourismIncome');
    if (ti > 0) money += Math.max(0, this.metric('tourism')) * ti;
    const tr = this.techAdd('tradeIncome');
    if (tr > 0) money += Math.max(0, this.colonyIds().length - 1) * tr;
    money = Math.round(money);
    research = Math.round(research);
    if (money > 0) g.empire.earn(money);
    if (research > 0) g.empire.s.research += research;
    this.ext().lastDividend = { money, research, day: Math.floor(g.clock.day) };
  }

  lastDividend(): { money: number; research: number; day: number } | null {
    return this.ext().lastDividend ?? null;
  }

  // ───────────────────────────── colonies

  /** A new colony was founded: add its settlers' grant goal. */
  registerColony(planetId: string, name: string, grant: number): void {
    if (this.game.empire.sandbox || grant <= 0) return;
    const ext = this.ext();
    ext.grants = ext.grants ?? [];
    if (ext.grants.some((x) => x.planetId === planetId)) return;
    ext.grants.push({ planetId, name, target: 500, money: grant, paid: false });
  }

  private grantProgress(gr: ColonyGrant): number {
    const cur = this.game.planet?.spec.id;
    if (gr.planetId === cur) return this.metric('population');
    return this.game.empire.s.colonies[gr.planetId]?.population ?? 0;
  }

  // ───────────────────────────── rewards & evaluation

  private grant(r: Reward): void {
    const e = this.game.empire;
    if (e.sandbox) return;
    const mult = this.techBonus('goalRewards');
    if (r.money) e.earn(Math.round(r.money * mult));
    if (r.research) e.s.research += Math.round(r.research * mult);
  }

  private goalProgress(gd: GoalDef): { cur: number; target: number; frac: number; gated: boolean } {
    let cur = 0;
    let target = 1;
    try {
      [cur, target] = gd.measure(this.ctx);
    } catch {
      /* measure failed: treat as 0 */
    }
    if (!Number.isFinite(cur)) cur = 0;
    const gated = gd.gate ? !gd.gate(this.ctx) : false;
    const frac = target > 0 ? Math.max(0, Math.min(1, cur / target)) : 0;
    return { cur, target, frac, gated };
  }

  private signatureDone(t: (typeof TIERS)[number]): { done: boolean; frac: number; waived: boolean } {
    const s = t.signature;
    if (!s) return { done: true, frac: 1, waived: false };
    if (s.tag && !this.tagAvailable(s.tag)) return { done: true, frac: 1, waived: true };
    let cur = 0;
    let target = 1;
    try {
      [cur, target] = s.measure(this.ctx);
    } catch {
      /* ignore */
    }
    const frac = target > 0 ? Math.max(0, Math.min(1, cur / target)) : 1;
    return { done: cur >= target, frac, waived: false };
  }

  private evaluate(): void {
    const g = this.game;
    const e = g.empire;
    const sandbox = e.sandbox;
    const now = performance.now();
    // ── tier ladder (one step per evaluation so every celebration gets its moment)
    if (!sandbox && e.s.tier < TIERS.length - 1) {
      const next = TIERS[e.s.tier + 1];
      if (this.totalPop() >= next.pop && this.signatureDone(next).done) this.advanceTier(next.tier);
    }
    // ── side goals
    for (const gd of GOALS) {
      if (e.s.goalsDone.includes(gd.id)) continue;
      const p = this.goalProgress(gd);
      if (p.gated || p.cur < p.target) continue;
      this.completeGoal(gd);
      break; // one per evaluation keeps toasts paced
    }
    // ── colony settlers' grants
    const ext = this.ext();
    for (const gr of ext.grants ?? []) {
      if (gr.paid || this.grantProgress(gr) < gr.target) continue;
      gr.paid = true;
      e.earn(gr.money);
      this.toastQueue.push({ title: `${gr.name} is thriving`, body: `Settlers’ grant paid: +₡${fmtN(gr.money)}`, icon: 'rocket', kind: 'good' });
    }
    // ── cosmos unlocks (career)
    if (!sandbox) this.scanUnlocks(!ext.primed);
    ext.primed = true;
    // ── publish
    this.recentDone = this.recentDone.filter((r) => now - r.at < 12_000);
    this.publish();
  }

  private advanceTier(n: number): void {
    const e = this.game.empire;
    const t = TIERS[n];
    e.s.tier = n;
    e.unlock('tier:' + n);
    this.grant(t.reward);
    const newItems = allItems().filter((d) => d.tier === n && !d.hidden && !d.growable).length;
    const mult = this.techBonus('goalRewards');
    const parts = [rewardText(t.reward, mult), newItems ? `${newItems} new blueprints` : ''].filter(Boolean).join(' · ');
    ui.tier.value = n;
    bus.emit('unlock', { kind: 'tier', id: 'tier:' + n });
    notify({ title: `${t.name}!`, body: `${t.opens}${parts ? ' ' + parts : ''}`, kind: 'milestone', icon: 'crown' });
    this.bonusDirty = true;
    this.evalTimer = 1.2;
  }

  private completeGoal(gd: GoalDef): void {
    const e = this.game.empire;
    e.s.goalsDone.push(gd.id);
    this.grant(gd.reward);
    this.recentDone.push({ id: gd.id, at: performance.now() });
    const rt = rewardText(gd.reward, this.techBonus('goalRewards'), e.sandbox);
    if (gd.major && !e.sandbox) {
      this.publish(true);
      bus.emit('milestone:reached', { goalId: gd.id });
    } else {
      const quietInSandbox = e.sandbox && (gd.category === 'city' || gd.category === 'people' || gd.category === 'economy' || gd.category === 'time');
      if (!quietInSandbox) this.toastQueue.push({ title: `Goal complete · ${gd.title}`, body: rt || gd.description, icon: gd.icon, kind: 'good' });
    }
  }

  private scanUnlocks(silent: boolean): void {
    const e = this.game.empire;
    const announce = (kind: 'planet' | 'system' | 'galaxy', id: string, name: string, body: string, icon: string) => {
      if (!e.unlock(`${kind}:${id}`) || silent) return;
      bus.emit('unlock', { kind, id: name });
      if (kind === 'planet') {
        this.toastQueue.push({ title: `${name} is open for settlers`, body, icon, kind: 'milestone' });
        this.game.audio.sfx('unlock');
      }
    };
    for (const gal of this.galaxies) {
      if (!this.meets(gal)) continue;
      if (gal.id !== 'g0') announce('galaxy', gal.id, gal.name, gal.tagline, 'galaxy');
      for (const sys of gal.systems) {
        if (!this.meets(sys)) continue;
        if (!sys.home) announce('system', sys.id, sys.name, sys.description ?? '', 'starSystem');
        for (const p of sys.planets) {
          if (!p.colonisable || !p.reqs.length || !this.meets(p)) continue;
          if (sys.home || p.reqs.length) announce('planet', p.id, p.name, 'Open the star map to found a colony.', 'planet');
        }
      }
    }
  }

  // ───────────────────────────── publishing

  private tierGoalView(): ExtGoalView | null {
    const e = this.game.empire;
    if (e.sandbox || e.s.tier >= TIERS.length - 1) return null;
    const next = TIERS[e.s.tier + 1];
    const pop = this.totalPop();
    const popFrac = Math.max(0, Math.min(1, pop / Math.max(1, next.pop)));
    const sig = this.signatureDone(next);
    const sigText = next.signature && !sig.waived ? ` · ${next.signature.title} ${sig.done ? '✓' : '✗'}` : '';
    const progress = next.signature && !sig.waived ? popFrac * 0.75 + sig.frac * 0.25 : popFrac;
    return {
      id: 'tier:' + next.tier,
      title: `Become a ${next.name}`,
      description: `${fmtN(next.pop)} citizens across your empire${next.signature && !sig.waived ? ` and “${next.signature.title}”: ${next.signature.description}` : ''}`,
      progress: Math.min(0.999, progress),
      done: false,
      reward: rewardText(next.reward, this.techBonus('goalRewards')),
      label: `${fmtK(pop)} / ${fmtK(next.pop)} citizens${sigText}`,
      tier: next.tier,
      category: 'milestone',
      icon: 'crown',
      kind: 'tier',
      major: true,
    };
  }

  private goalView(gd: GoalDef): ExtGoalView {
    const e = this.game.empire;
    const done = e.s.goalsDone.includes(gd.id);
    const p = this.goalProgress(gd);
    const unit = gd.unit ? ` ${gd.unit}` : '';
    const isMoney = gd.unit === '₡' || gd.unit === '₡/mo';
    const label = done
      ? 'Complete'
      : p.gated && gd.gateText
        ? gd.gateText
        : isMoney
          ? `₡${fmtK(Math.max(0, p.cur))} / ₡${fmtK(p.target)}${gd.unit === '₡/mo' ? ' a month' : ''}`
          : p.target <= 1 && !gd.unit
            ? p.cur >= 1
              ? 'Done'
              : 'Not yet'
            : `${fmtK(Math.max(0, p.cur))} / ${fmtK(p.target)}${unit}`;
    const hide = gd.secret && !done;
    return {
      id: gd.id,
      title: hide ? 'Secret goal' : gd.title,
      description: hide ? 'Keep playing (or keep breaking things) to discover it.' : gd.description,
      progress: done ? 1 : hide ? 0 : p.gated ? Math.min(p.frac, 0.95) * 0.5 : p.frac,
      done,
      reward: rewardText(gd.reward, this.techBonus('goalRewards'), e.sandbox) || undefined,
      label: hide ? '???' : label,
      tier: gd.minTier,
      category: gd.category,
      icon: hide ? 'help' : gd.icon,
      kind: 'goal',
      secret: gd.secret,
      major: gd.major,
    };
  }

  private grantViews(): ExtGoalView[] {
    return (this.ext().grants ?? []).map((gr) => {
      const have = this.grantProgress(gr);
      return {
        id: 'colony:' + gr.planetId,
        title: `Settle ${gr.name}`,
        description: `Grow ${gr.name} to ${gr.target} citizens to receive the Colonial Office settlers’ grant.`,
        progress: gr.paid ? 1 : Math.min(1, have / gr.target),
        done: gr.paid,
        reward: `+₡${fmtN(gr.money)}`,
        label: gr.paid ? 'Grant paid' : `${fmtK(have)} / ${gr.target} citizens`,
        category: 'space',
        icon: 'rocket',
        kind: 'colony' as const,
      };
    });
  }

  /** Publish the HUD goal list (next milestone + colony grants + a few active goals + just-completed). */
  private publish(force = false): void {
    const e = this.game.empire;
    const out: ExtGoalView[] = [];
    const tier = this.tierGoalView();
    if (tier) out.push(tier);
    out.push(...this.grantViews().filter((x) => !x.done).slice(0, 2));
    const t = e.s.tier;
    const active = GOALS.filter((gd) => !e.s.goalsDone.includes(gd.id) && !gd.secret && (gd.minTier ?? 0) <= t)
      .map((gd) => ({ gd, p: this.goalProgress(gd) }))
      .filter((x) => !x.p.gated || x.p.frac > 0)
      .sort((a, b) => b.p.frac - a.p.frac)
      .slice(0, 3)
      .map((x) => this.goalView(x.gd));
    out.push(...active);
    for (const r of this.recentDone) {
      const gd = GOALS.find((x) => x.id === r.id);
      if (gd) out.push(this.goalView(gd));
    }
    const sig = out.map((x) => `${x.id}:${Math.round(x.progress * 100)}:${x.done ? 1 : 0}:${x.label}`).join('|');
    if (!force && sig === this.goalSig) return;
    this.goalSig = sig;
    this.goals = out;
    ui.goals.value = out;
  }

  /** Every goal for the goals panel: tier ladder, colony grants and achievements. */
  getAllGoals(): ExtGoalView[] {
    const e = this.game.empire;
    const out: ExtGoalView[] = [];
    if (!e.sandbox) {
      const pop = this.totalPop();
      for (const t of TIERS) {
        if (t.tier === 0) continue;
        const done = e.s.tier >= t.tier;
        const sig = this.signatureDone(t);
        out.push({
          id: 'tier:' + t.tier,
          title: t.name,
          description: `${t.blurb} Needs ${fmtN(t.pop)} citizens${t.signature && !sig.waived ? ` and “${t.signature.title}”` : ''}. Opens: ${t.opens}`,
          progress: done ? 1 : Math.min(0.999, Math.max(0, Math.min(1, pop / t.pop)) * (t.signature && !sig.waived ? 0.75 : 1) + (t.signature && !sig.waived ? sig.frac * 0.25 : 0)),
          done,
          reward: rewardText(t.reward, this.techBonus('goalRewards')),
          label: done ? 'Reached' : `${fmtK(pop)} / ${fmtK(t.pop)} citizens`,
          tier: t.tier,
          category: 'milestone',
          icon: 'crown',
          kind: 'tier',
          major: true,
        });
      }
      out.push(...this.grantViews());
    }
    for (const gd of GOALS) out.push(this.goalView(gd));
    return out;
  }

  /** Category metadata for the goals panel. */
  goalCategories() {
    return CATEGORY_INFO;
  }
}

// ───────────────────────────── module-level helpers (for sim / tools / ui-panels)

/** Tech multiplier for a key (1 = no bonus). Safe before the game exists. */
export function techBonus(key: string): number {
  try {
    return liveGame?.progression?.techBonus(key) ?? 1;
  } catch {
    return 1;
  }
}

/** Sim-ready tech modifier patch. */
export function techMods(): Record<string, number> {
  try {
    return liveGame?.progression?.techMods() ?? {};
  } catch {
    return {};
  }
}

/** Every goal (tiers, colony grants, achievements) — for the goals panel. */
export function getAllGoals(): ExtGoalView[] {
  try {
    return liveGame?.progression?.getAllGoals() ?? [];
  } catch (e) {
    console.error('[progression] getAllGoals failed', e);
    return [];
  }
}
