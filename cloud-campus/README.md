# Cloud Campus Sandbox

A browser physics toybox on a floating high-school campus. Spawn students and faculty, possess one at a time, and use their powers on the props, on each other, and on the school itself. There are no quests, no inventory, no XP and no story. It is a sandbox, and it should be fun inside a minute.

> **Fan project notice.** This is a personal, non-commercial fan sandbox inspired by the publicly known power concepts from the 2005 film *Sky High*. It contains no Disney art, logos, costumes, character likenesses, dialogue or title treatment. Every figure is an original geometric silhouette drawn on a canvas, and character names appear only as UI labels. Nothing is fetched at runtime: no images, fonts or audio.

## Run it

```bash
cd cloud-campus
npm install
npm run dev      # opens http://localhost:5173
```

Other scripts: `npm run build` (typecheck plus production bundle) and `npm run typecheck`.

Stack: Vite + TypeScript, one full-window Canvas 2D, and [Matter.js](https://brm.io/matter-js/) for rigid bodies, impulses and constraints. No React, no Three.js, no backend.

## Controls

| Input | Action |
|---|---|
| A / D or ← → | Move |
| Space (also W / ↑) | Jump. Fliers rise while it is held and glide when it is released. Hold S / ↓ to dive. |
| Mouse | Aim |
| J or left click | Primary power |
| K or right click | Secondary power |
| Q / E, or click the bottom strip | Possess the previous / next character |
| Tab | Spawn menu (Esc closes it) |
| R | Reset the scene |
| G | Toggle the anti-gravity core |
| T | Rowdy NPCs: uncontrolled characters use their powers at random |
| H | Show or hide the help card |
| \` (backtick) | Debug draw: colliders, velocities, constraints, ground contacts, fall line, FPS |

Right-click a card in the strip (or click its ✕) to despawn that character.

## Your first 60 seconds

1. You start as **Will**. Click a crate to grab it, then click again to throw it. Hold Space to fly up while carrying it.
2. Press **G**. The core under the school shuts off, gravity surges, the campus tips, and loose props slide toward the open edge.
3. Press **E** until you are **Gwen**. Walk to the locker row, aim at a locker and left-click. One locker hides a **power cell**. (Zach's Flash or Nurse Spex's X-Ray will show you which one.)
4. Carry or throw the cell into the glowing intake socket in the courtyard. The core overcharges and the campus gets 20 seconds of moon gravity.

## The campus

One connected slab, left to right:

- **Gym**: bleachers, a hoop you can bank the ball off, two mats, a training dummy, and a hijackable dodgeball pitcher.
- **Locker row**: six lockers and a vending machine, all hijackable by Gwen. One locker holds the power cell.
- **Courtyard**: open ground, stacked crates, the respawn pad, and the core intake. A cloud ledge floats overhead.
- **Cafeteria**: tables and chairs as real compound bodies, trays, stairs and a balcony.
- **The open edge**: beyond the cafeteria there is only sky and a small islet. Anything that falls past the fall line respawns on the courtyard pad after 1.5 seconds with a puff. Debris (cans, books, dodgeballs) just disappears.

The **anti-gravity core** glows under the courtyard and is wired to the intake.

| State | Gravity | Effect |
|---|---|---|
| Online | 1.0 g | Normal |
| Offline (G) | 1.7 g plus a sideways pull | The view tilts and loose props slide toward the edge |
| Overcharged (cell) | 0.42 g for 20 s | Everything floats. The cell regrows in a random locker afterwards |

Live props are capped at 40 and characters at 24. When the prop cap is hit, the oldest debris goes first.

## Roster

J is the primary power and K is the secondary. A character with a single active power gets that power's alternate move on K.

| Character | Role | J | K | Notes |
|---|---|---|---|---|
| Will Stronghold | hero | Grab / Throw (punches if nothing is in reach) | Sky Dash | Flight |
| Layla | hero | Vine Lash: lassos bodies, or grapples terrain and swings | Root Snare: ties a body to the ground | Fire burns vines |
| Warren Peace | hero | Fireball (explodes, ignites) | Flame Jet (cone) | Fireproof. Melts ice. Can rocket-jump |
| Ethan | sidekick | Melt: toggle puddle form, slips under tables | Slick Spill: frictionless zone | |
| Magenta | sidekick | Guinea Form: toggle tiny, fast form | Scurry dash | Will can throw her |
| Zach | sidekick | Flash: dazes and pushes, reveals the cell | Beacon: lures NPCs and floats light props | |
| Larry | hero | Rock Form: toggle a rolling boulder | Boulder Charge | Heavy enough to bulldoze tables |
| Ron Wilson | faculty | Grow: toggle giant form | Stomp: ground shockwave | Giant landings shake things |
| Gwen | villain | Hijack Machine: aim at a machine to open it, or elsewhere to make the nearest one fire at that spot | Pacifier Ray: babifies people (8 s, no powers), shrinks props | |
| Penny | villain | Split: spawn a clone (cap 5) | Swarm: clones rush the aim point | Clones follow and copy jumps, and you can possess them |
| Lash | villain | Stretch Punch (zips to terrain) | Yank: pulls a body in | |
| Speed | villain | Blur Dash (rams everything in the path) | Whirlwind vortex | Super speed |
| Freeze Girl | villain | Freeze Ray: ice-blocks people, makes props frictionless | Ice Wall: on ground it is a wall, in mid-air a ledge (cap 3) | Sonic shatters ice, fire melts it |
| The Commander | hero | Grab / Throw | Sky Dash | Flight. Invulnerable: immune to ice, fire, daze and rays, and takes 30% knockback |
| Jetstream | hero | Sky Dash | Jet Burst: launches up and blasts what is below | Flight |
| Principal Powers | faculty | Comet: flies as a comet and lands with a shockwave | Comet Ring: 8 knockback sparks | |
| Coach Boomer | faculty | Sonic Boom: long cone, stuns, shatters ice | Whistle: 360° shockwave | |
| Nurse Spex | faculty | X-Ray Scan: skeletons, velocities, the hidden cell | Triage Pulse: clears statuses and lifts everyone nearby | |

Friend and foe is only a `role` tag. Nobody is at war, and uncontrolled characters idle, wander, avoid cliffs, follow beacons and panic when on fire. Turn on **Rowdy** (T) for chaos.

## How it is built

```
src/
  main.ts     boot, fixed 60 Hz loop, input routing, reset
  types.ts    PowerId, CharacterDef, body tags, small math helpers
  roster.ts   character defs (data only)
  powers.ts   power registry: (caster, aim, world) + cooldown + cap
  actor.ts    one character: body shapes and forms, controller, statuses, NPC brain
  world.ts    Matter engine, campus layout, props, machines, core, hazards, raycast/blast/cone
  fx.ts       particles, rings, beams, floating text (visual only)
  render.ts   sky, parallax clouds, campus, silhouettes, overlays, debug draw
  camera.ts   follow with look-ahead, tilt, shake, screen↔world
  input.ts    keyboard and mouse state
  hud.ts      DOM overlay: strip, cooldowns, spawn menu, help, toasts
```

**Powers move bodies, not just pixels.** Every power goes through a handful of physical verbs in `world.ts`: `kick` (velocity impulse), `blast` (radial), `cone` (directional), `raycast`, plus Matter constraints for grabs and vines. Heavier bodies move less but always move. Knockback above a threshold sends a character tumbling: rotation is unlocked, then eased back upright once they land.

**Grabs** use a world-anchored spring that chases the hand point, so super strength never drags the holder around, while the held body still has mass and momentum when thrown. Held and thrown objects share the thrower's collision group for 0.3 s so they don't clip the thrower on release.

**Form toggles** (melt, guinea, rock, grow) and babification swap the Matter body for a new shape while keeping the feet planted and the momentum. Constraints that pointed at the old body are dropped first.

### Add a power

1. Add an id to `PowerId` in `types.ts`.
2. Add an entry to `POWERS` in `powers.ts`:

```ts
gust: {
  id: 'gust', name: 'Gust', cooldown: 0.8, cap: 0,
  use: (caster, aim, world) => {
    world.cone(caster.hand(), caster.aimDir(aim), 260, 0.5, 14, { owner: caster, exclude: [caster.body] });
  },
  alt: { name: 'Updraft', cooldown: 1.5, use: (c, _aim, w) => w.blast(c.pos.x, c.pos.y + 40, 160, 12, { exclude: [c.body], upBias: 2 }) },
},
```

Return `false` from `use` when nothing happened, so no cooldown is spent.

### Add a character

Append a `CharacterDef` to `ROSTER` in `roster.ts`. It shows up in the spawn menu automatically, and its look is generated from `color`, `role` and a hash of `id`.

## Debugging

- Press **\`** for collider outlines (static, sensor, actor, prop, projectile), velocity vectors, constraint lines, a ground-contact light under each character, the fall line, and live counts.
- In dev builds, `window.cc.world` exposes the live `World` in the browser console, for example `cc.world.toggleCore()` or `cc.world.actors.map(a => a.def.name)`.

## Known limits

- Ethan's puddle can pop out of tight gaps when he un-melts, because Matter resolves the overlap with a shove.
- Very fast bodies can occasionally tunnel through thin table legs. Speeds are clamped to keep this rare.
- NPCs do not fly, so a flier that is not possessed walks like everyone else.
