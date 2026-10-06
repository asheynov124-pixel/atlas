/**
 * Utility networks. Roads and buildings "conduct" (power lines and pipes follow the streets, and adjacent
 * buildings share service like SimCity's classic grid); every connected blob of conductive tiles is one network
 * with its own supply / demand per utility (power, water, oxygen, garbage, data). Orbital producers beam their
 * output planet-wide and are shared by networks in proportion to unmet demand.
 *
 * Rebuild is a union-find over tiles (O(tiles)), done lazily when topology changes; a building that touches a
 * single existing network simply joins it without a rebuild. Rationing is spatially clustered and stable: each
 * consumer has a fixed hash (mostly per neighbourhood) and is served iff hash < ratio — so a shortage darkens
 * whole blocks at the edge of the grid instead of flickering random houses.
 */
import type { Planet } from '../world/planet';
import { U_COUNT } from './state';

export class Networks {
  /** network id per tile, −1 = not conductive */
  label: Int32Array;
  count = 0;
  dirty = true;
  /** [utility][network] */
  supply: Float64Array[] = [];
  demandSvc: Float64Array[] = [];
  demandGrow: Float64Array[] = [];
  /** supply / demand of the last resolved day (survive beginDay) */
  lastSupply: Float64Array[] = [];
  lastDemand: Float64Array[] = [];
  /** served ratios for services (prio 0) and growables (prio 1) */
  ratioSvc: Float32Array[] = [];
  ratioGrow: Float32Array[] = [];
  /** planet-wide producers (orbitals / unconnected) */
  global = new Float64Array(U_COUNT);
  lastGlobal = new Float64Array(U_COUNT);
  /** totals of the last completed day (for stats) */
  totalSupply = new Float64Array(U_COUNT);
  totalDemand = new Float64Array(U_COUNT);
  private parent: Int32Array;
  /** tile count per network (largest = main city) */
  size: Int32Array = new Int32Array(0);

  constructor(private planet: Planet) {
    this.label = new Int32Array(planet.count).fill(-1);
    this.parent = new Int32Array(planet.count);
  }

  private conductive(t: number): boolean {
    const p = this.planet;
    return p.road[t] !== 0 || p.building[t] >= 0;
  }

  private find(x: number): number {
    const par = this.parent;
    while (par[x] !== x) {
      par[x] = par[par[x]];
      x = par[x];
    }
    return x;
  }

  rebuild(): void {
    const p = this.planet;
    const g = p.grid;
    const n = p.count;
    const par = this.parent;
    for (let t = 0; t < n; t++) par[t] = t;
    for (let t = 0; t < n; t++) {
      if (!this.conductive(t)) continue;
      for (let q = g.start[t]; q < g.start[t + 1]; q++) {
        const nb = g.nbr[q];
        if (nb > t && this.conductive(nb)) {
          const a = this.find(t), b = this.find(nb);
          if (a !== b) par[a] = b;
        }
      }
    }
    const remap = new Int32Array(n).fill(-1);
    let c = 0;
    for (let t = 0; t < n; t++) {
      if (!this.conductive(t)) {
        this.label[t] = -1;
        continue;
      }
      const r = this.find(t);
      if (remap[r] < 0) remap[r] = c++;
      this.label[t] = remap[r];
    }
    this.resize(c);
    for (let t = 0; t < n; t++) if (this.label[t] >= 0) this.size[this.label[t]]++;
    this.dirty = false;
  }

  private resize(c: number): void {
    this.count = c;
    const mk64 = () => new Float64Array(Math.max(1, c));
    const mk32 = () => new Float32Array(Math.max(1, c)).fill(1);
    this.supply = Array.from({ length: U_COUNT }, mk64);
    this.demandSvc = Array.from({ length: U_COUNT }, mk64);
    this.demandGrow = Array.from({ length: U_COUNT }, mk64);
    this.lastSupply = Array.from({ length: U_COUNT }, mk64);
    this.lastDemand = Array.from({ length: U_COUNT }, mk64);
    this.ratioSvc = Array.from({ length: U_COUNT }, mk32);
    this.ratioGrow = Array.from({ length: U_COUNT }, mk32);
    this.size = new Int32Array(Math.max(1, c));
  }

  /**
   * Tiles became conductive (new building / road). Joins an existing network when it touches exactly one;
   * otherwise marks a full rebuild (merges / new islands).
   */
  join(tiles: readonly number[]): void {
    if (this.dirty) return;
    const p = this.planet;
    const g = p.grid;
    let net = -2;
    for (const t of tiles) {
      for (let q = g.start[t]; q < g.start[t + 1]; q++) {
        const l = this.label[g.nbr[q]];
        if (l < 0) continue;
        if (net === -2) net = l;
        else if (net !== l) {
          this.dirty = true;
          return;
        }
      }
    }
    if (net < 0) {
      this.dirty = true;
      return;
    }
    for (const t of tiles) {
      if (this.label[t] !== net) this.size[net]++;
      this.label[t] = net;
    }
  }

  /** Network a tile draws from: its own label, else the first conductive neighbour's. */
  netOf(t: number): number {
    const l = this.label[t];
    if (l >= 0) return l;
    const g = this.planet.grid;
    for (let q = g.start[t]; q < g.start[t + 1]; q++) {
      const nl = this.label[g.nbr[q]];
      if (nl >= 0) return nl;
    }
    return -1;
  }

  /** Clear per-day accumulators before the building pass. */
  beginDay(): void {
    for (let u = 0; u < U_COUNT; u++) {
      this.supply[u].fill(0);
      this.demandSvc[u].fill(0);
      this.demandGrow[u].fill(0);
    }
    this.global.fill(0);
  }

  /**
   * Turn the day's totals into served ratios. `free` = sandbox free utilities.
   * Orbital/global supply is split between networks by unmet demand.
   */
  resolve(free: boolean): void {
    for (let u = 0; u < U_COUNT; u++) {
      const sup = this.supply[u], ds = this.demandSvc[u], dg = this.demandGrow[u];
      const rs = this.ratioSvc[u], rg = this.ratioGrow[u];
      let unmetTotal = 0, supTotal = this.global[u], demTotal = 0;
      for (let k = 0; k < this.count; k++) {
        const unmet = ds[k] + dg[k] - sup[k];
        if (unmet > 0) unmetTotal += unmet;
        supTotal += sup[k];
        demTotal += ds[k] + dg[k];
      }
      this.totalSupply[u] = supTotal;
      this.totalDemand[u] = demTotal;
      const ls = this.lastSupply[u], ld = this.lastDemand[u];
      for (let k = 0; k < this.count; k++) {
        ls[k] = sup[k];
        ld[k] = ds[k] + dg[k];
      }
      this.lastGlobal[u] = this.global[u];
      const glob = this.global[u];
      for (let k = 0; k < this.count; k++) {
        if (free) {
          rs[k] = 1;
          rg[k] = 1;
          continue;
        }
        const unmet = ds[k] + dg[k] - sup[k];
        const share = unmet > 0 && unmetTotal > 0 ? (glob * unmet) / unmetTotal : 0;
        const avail = sup[k] + share;
        const svc = ds[k];
        rs[k] = svc <= 1e-9 ? 1 : Math.min(1, avail / svc);
        const rem = Math.max(0, avail - svc);
        // 3 % headroom so rationed demand never exceeds supply
        rg[k] = dg[k] <= 1e-9 ? 1 : rem >= dg[k] ? 1 : Math.min(1, (rem / dg[k]) * 0.97);
      }
    }
  }

  /** Supply ratio of network k for utility u (0..∞, 1 = balanced). */
  balance(u: number, k: number): number {
    if (k < 0 || k >= this.count) return 0;
    const d = this.lastDemand[u][k];
    return d <= 0 ? (this.lastSupply[u][k] > 0 || this.lastGlobal[u] > 0 ? 9 : 0) : (this.lastSupply[u][k] + (this.lastGlobal[u] > 0 ? this.lastGlobal[u] * 0.5 : 0)) / d;
  }

  /** Did network k have any supply of u (local or orbital) on the last resolved day? */
  hasSupply(u: number, k: number): boolean {
    return (k >= 0 && k < this.count && this.lastSupply[u][k] > 0) || this.lastGlobal[u] > 0;
  }
}
