# Cosmopolis — Architecture & Team Contract

Cosmopolis is a planet-scale city builder in space. You build cities on **spherical hex-tile planets**
(Goldberg polyhedra: 10f²+2 tiles, 12 pentagons), grow them from an outpost to a galactic civilisation, unlock new
planets → star systems → galaxies, design your own buildings, and play god with disasters that go all the way to
black holes and vacuum decay. Sandbox mode removes every constraint.

**Targets:** iOS Safari / home-screen PWA first (iPhone 12+ at 60 fps on Medium), iPad, desktop.
**Stack:** Vite 8 · TypeScript (strict) · three.js r186 (WebGLRenderer) · Preact 10 + @preact/signals · postprocessing.
No external art assets: every mesh, texture, sound and icon is procedural / inline.

---

## 1. Directory map & ownership

Each file has ONE owner. Only edit files you own. Foundation files are shared contracts — do not edit them
(see §7 for how to request a change).

| Path | Owner | What |
|---|---|---|
| `src/core/*` | foundation | types, events (bus), rng/noise, settings, save, b64 |
| `src/world/hexsphere.ts, planet.ts, geo.ts, ops.ts` | foundation | grid, planet model, tile↔world, mutation API |
| `src/world/planetgen.ts` | **terrain** | procedural planet generation |
| `src/content/kit.ts, catalog.ts, styles.ts, planetTypes.ts, zones.ts, index.ts, items/zoneBrushes.ts` | foundation | mesh kit, item registry, palettes |
| `src/content/items/growResCom.ts` + `src/content/meshes/zoned/rc/**` | **zoned-rc** | residential & commercial growables |
| `src/content/items/growIndOffice.ts` + `src/content/meshes/zoned/io/**` | **zoned-io** | industrial & office growables |
| `src/content/items/{utilities,industry,transit}.ts` + `src/content/meshes/utilities/**` | **utilities** | power/water/air/waste/data, extractors, transit |
| `src/content/items/{services,education,leisure}.ts` + `src/content/meshes/services/**` | **services** | safety, health, education, research, parks, venues |
| `src/content/items/{landmarks,orbital}.ts` + `src/content/meshes/landmarks/**` | **landmarks** | landmarks, wonders, orbital & megastructures |
| `src/content/items/{roads,decor}.ts` + `src/content/meshes/props/**`, `src/render/roads/**`, `src/render/props/**` | **roads-props** | road network rendering, nature & decor props |
| `src/render/materials.ts, InstancePool.ts, BuildingRenderer.ts, Engine.ts, PlanetView.ts, View.ts` | foundation | rendering core |
| `src/render/planet/**` | **terrain** | terrain, water, atmosphere, clouds, overlay |
| `src/render/space/**`, `src/render/post/**` | **space-post** | sky, stars, sun, moons, rings, lighting, post FX, quality |
| `src/render/agents/**` | **life** | traffic, aircraft, ships, orbitals in motion |
| `src/render/fx/**`, `src/god/**` | **god** | god powers, disasters, FX, chrono rewind, god UI |
| `src/render/CameraRig.ts`, `src/input/**`, `src/tools/**`, `src/game/Commands.ts` | **tools** | camera, gestures, tools, undo |
| `src/sim/**`, `tests/sim*.test.ts` | **sim** | simulation & economy |
| `src/cosmos/**` | **cosmos** | universe, system/galaxy/universe views, travel, progression |
| `src/audio/**` | **audio** | procedural music & sfx |
| `src/studio/**` | **studio** | Architect Studio (custom buildings) |
| `src/ui/App.tsx`, `src/ui/styles.css`, `src/ui/core/**`, `src/ui/icons.tsx`, `src/render/Thumbnails.ts` | **ui-core** | shell, HUD, dock, build sheet, inspector, menus |
| `src/ui/panels/**` | **ui-panels** | budget, policies, districts, goals, stats, lenses, settings, saves, news, photo mode, help |
| `src/game/Game.ts, Clock.ts, Empire.ts, System.ts, instance.ts`, `src/main.tsx`, `src/dev/**`, `src/ui/store.ts`, `src/ui/registry.ts` | foundation | orchestration & glue |

You may create new files inside your own directories freely.

## 2. Runtime overview

```
main.tsx ─ imports content (registers items) + feature UIs (register panels/overlays) → new Game() → boot()
Game ─ engine (WebGLRenderer + PostFX) ─ activeView (PlanetView | SystemView | GalaxyView | UniverseView | StudioView)
     ─ empire (save state: money, unlocks, colonies' PlanetSaves)  ─ planet (active) + ops (PlanetOps)
     ─ systems: audio, sim, progression, cosmos, camera, tools, commands, input, god, studio  (game/System.ts)
     ─ clock (days, speed 0..4, timeOfDay)   ─ publishUI() → ui.* signals (≈5 Hz)
```
* Global access: `import { game } from '../game/instance'` (live binding; set before anything runs).
* Main loop `Game.step(dt)`: clock → `sim.tick(days)` → every `system.update(dt)` → `activeView.update(dt)` → render.
* Planet lifecycle: `game.enterPlanet(spec)` serialises the old planet into `empire.s.planets[id]`, restores/generates
  the new one, builds a `PlanetView`, calls `system.onPlanetLoaded(planet)`, emits `planet:loaded`.

## 3. World model (src/world)

* **HexGrid** (`hexsphere.ts`): unit-sphere tile centres/corners, CSR neighbours. `neighbor(i,k)` is across the edge
  (corner k → corner k+1). Helpers: `tileAt(x,y,z)`, `disk(i,r)`, `ring(i,r)`, `withinAngle`, `footprint(i, 1|7|19)`,
  `path(a,b)`. Pentagons exist (degree 5) — never assume 6.
* **Planet** (`planet.ts`): per-tile typed arrays `elevation (Int8 terraces) · biome · feature · zone · road · roadLinks
  (bitmask of neighbour k) · building (id | -1) · district · flags`; maps `buildings · props · orbitals`; `districts[]`;
  `seaOffset`; `simData` (sim-owned JSON); `ext` (module-namespaced JSON). Units: `TILE_SIZE = 2` world units between
  tile centres (1 unit ≈ 20 m), `LEVEL_HEIGHT = 0.32` per terrace, `FLOOR_HEIGHT = 0.2` per storey,
  radius = `TILE_SIZE / grid.unitEdge` (f=40 → ≈ 66). Tile is water iff `hasOcean && elevation < seaOffset`.
* **geo.ts**: `tilePosition`, `tileFrame`, `tileMatrix(planet, tile, rot, out, {height, scale, yaw, u, v})`,
  `pickTile(planet, ray)`. Object space on a tile: **+Y = up (normal), +Z = forward (toward neighbour `rot`), +X = right**.
* **ops.ts — PlanetOps**: THE mutation API (`game.ops`). Validates, mutates, emits events. `checkPlace`, `placeBuilding`,
  `removeBuilding`, `updateBuilding`, `setZone`, `buildRoad(path, kind)`, `removeRoad`, `setElevation/raise`,
  `setBiome`, `setFeature`, `setSeaOffset`, `setFlags`, districts, `addProp/removeProp`, `addOrbital/removeOrbital`,
  `bulldoze`, `destroyTiles`. Money/undo/sfx live one level up in `game.commands` (player actions).

## 4. Events (core/events.ts) — `bus.on(type, fn)` returns an unsubscribe

`planet:loaded/unloading · tiles:terrain|zone|road|district|flags · planet:sea · building:added|removed|updated ·
prop:* · orbital:* · selection:changed · tool:changed · view:changed · lens:changed · notify · news ·
milestone:reached · unlock · disaster:start|end · sim:day|month · game:saved|loaded · catalog:changed ·
settings:changed · quality:changed · photo:capture`. Always unsubscribe in `dispose()`.

## 5. Content (src/content)

* **ItemDef** (`catalog.ts`) — everything placeable: id, name, category, group, description, flavor (witty), icon
  (emoji fallback), footprint 1|7|19, placement surface|water|orbit|free, cost, upkeep, **tier 0..8**, planetTypes?,
  requires {coastal, feature[], road, minElevation}, effects {power, water, oxygen, jobs, housing, research, tourism,
  pollution, noise, landValue, happiness, income, garbage, data, radius}, coverage [{service, radius, strength,
  capacity}], unique, variants, styleable, growable {zone, minLevel, maxLevel}, road {kind,…}, zone, tool, hidden,
  mesh (factory), height, tags, orbit. Register with `registerItems([...])` at module top level.
  Read the balance guide at the top of catalog.ts.
* **Tiers** (career): 0 Outpost · 1 Settlement (pop 400) · 2 Township (1.5k) · 3 Colony City (5k) · 4 Metropolis (12k)
  · 5 Megacity (25k) · 6 Interplanetary Power (50k) · 7 Stellar Civilisation (100k) · 8 Galactic Civilisation (200k).
* **Mesh factories** receive `MeshContext {b: MeshBuilder, rng, def, variant, level, styleId, style, lod, footprint}`
  and draw with the kit (`kit.ts`): `box, cyl, cone, prism, pyramid, gable, wedge, sphere, dome, torus, lathe, extrude,
  tube, plane, panel, geometry` + transform stack `push/pop/group`. Material channels via `mat:` (`Mat.Window`,
  `WindowSmall`, `Glass`, `Glow`, `Metal`, `Light` (night-only), `Solar`, `Foliage` (sways), `Water`, `Holo`, `Lava`,
  `Screen` (animated ads)). Lit windows, neon and city lights at night come free from these channels.
  Footprint radius: 1 → 0.92, 7 → 2.5, 19 → 4.3 world units. Use `detail: true` on small parts (dropped at LOD1).
  **Triangle budgets (LOD0):** prop ≤ 150 · growable ≤ 400 · ploppable ≤ 1 500 · landmark ≤ 3 000 · wonder ≤ 6 000.
  Use `ctx.style` palettes for styleable meshes so the 8 architectural styles re-skin them.
* Geometry is cached per (id, variant, level, style, lod). Factories must be deterministic (use `ctx.rng`).

## 6. Rendering

* Shared building material (`render/materials.ts`): one patched `MeshStandardMaterial` for all kit meshes; uniforms
  in `shared` (`uTime, uSunDir, uPlanetCenter, uNightLights, uWindowColor, uApocalypse, uCameraPos`) — merge them into
  your own shaders (`SHADER_COMMON` gives `cHash12`, `cNight(wpos)`).
* Per-instance visual state `InstState` (Dark, Burning, Frozen, Goo, Blessed, Irradiated, Highlight, Blueprint).
  BuildingRenderer derives it from tile flags / building state; `forceState(id, s)` overrides.
* **InstancePool**: `add(key, matrix, color, radius, state) → handle`, `setMatrix/setColor/setState/setVisible/setKey/
  remove`, `update(camera, planetRadius)` — horizon + frustum culling and LOD every time the camera moves. Use it for
  anything numerous (trees, props, cars). `frustumCulled = false` is handled for you.
* PlanetView composition (see the file header): `root` (planet-fixed group) · `env` · `surface` · `roads` · `props` ·
  `buildings` · `life` · `orbitals` · `fx` · `toolLayer`. `view.sunDir` is the planet→sun unit vector.
* Coordinates: planet centre = origin, axis = +Y. Camera is driven by `game.camera` (CameraRig).
* Performance budgets (iPhone 12, Medium tier, 1.5 DPR): ≤ 150 draw calls, ≤ 1.2 M triangles visible, ≤ 4 ms CPU
  per frame for game logic, no per-frame allocations in hot loops, no shadows on Low.

## 7. Rules for every agent

1. **Ownership.** Edit only your files. Never modify foundation files. If you truly need a contract change, implement a
   local workaround and list the request in your final report under "CONTRACT REQUESTS".
2. **Shared working tree.** Other agents are editing other files concurrently. Never run `git add -A`, `git commit -a`,
   `git stash`, `git checkout -- <path>`, `git reset`, `git clean`, or anything that touches files you don't own.
   Commit only your own paths: `git add <your paths> && git commit -m "<area>: …"` (retry if index.lock is busy).
3. **No new dependencies.** package.json is frozen (three, preact, @preact/signals, postprocessing are available).
4. **Typecheck your files:** `npx tsc --noEmit -p . 2>&1 | grep -E '^src/(your|paths)'` must be empty. Errors in other
   agents' files are their in-progress work — ignore them.
5. **See your work.** `node scripts/shot.mjs --query "autostart=sandbox&demo=city&daynight=day&view=close" --out
   <scratch>/shots --name x` launches the app headless (SwiftShader WebGL — slow, ~15 fps, visuals are faithful) and
   saves PNGs; `--script file.mjs` lets you drive it (`page.evaluate(() => window.__cosmo.game…)`, `shot('name')`).
   Devices: `--device iphone|iphone-land|ipad|desktop`. LOOK at the screenshots (Read the PNG) and iterate until it
   is genuinely beautiful. If the page breaks because of another agent's file, wait a minute and retry.
6. **Quality bar.** This game must feel premium: cohesive art direction, readable silhouettes at every zoom, delightful
   details, smooth 60 fps on iPhone, zero console errors, graceful fallbacks (never crash the frame loop — catch and log).
7. **Mobile first.** Touch targets ≥ 44 px, safe-area insets, no hover-only affordances, no text < 11 px, works in portrait
   and landscape, respects `settings.value.reduceMotion`.
8. **Determinism.** Use `Rng` / `Noise3` with seeds for anything generated; avoid `Math.random()` in content factories.
9. **Dispose** everything you create (geometries, materials, listeners) when the planet/view unloads.
10. Write plain, well-named code with a short header comment per file; match the surrounding style.

## 8. Test hooks

`window.__cosmo = { game, ready, params, debugInfo(), demo(kind), step(seconds, fps) }`. URL params (dev/debug.ts):
`autostart=sandbox|career · seed · planet=<type> · demo=city|metropolis · view=orbit|close|horizon|street ·
time=0..1 · daynight=cycle|day|night|golden · speed · lens · ui=0 · select · tool+item · quality`.
Modules may add their own params (document them in your file header), e.g. `god=meteor`, `cosmos=galaxy`,
`studio=1`, `panel=budget`.
