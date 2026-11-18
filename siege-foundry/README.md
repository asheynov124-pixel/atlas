# Siege Foundry: One-Minute Defense

A foundry is besieged for sixty seconds. Its Crucible Cannon fires by itself; your job is the
two decisions between waves. Vanilla HTML, CSS, JavaScript and canvas. No build step, no
dependencies at runtime, no network.

This folder is unrelated to the Atlas app in the rest of the repository.

## Play

Open `index.html` in a browser (double-click works: the scripts are classic scripts, not modules).
Or serve the folder:

```sh
cd siege-foundry
python3 -m http.server 8000      # then visit http://localhost:8000
```

| Key / click | Does |
|---|---|
| `Enter` / `Space`, or the gold button | Start, continue past an intermission, restart after a run |
| `1`, or the green card's button | Buy **Faster Firing** (intermissions only) |
| `2`, or the orange card's button | Buy **Heavier Shot** (intermissions only) |
| `R` | Restart after a win or loss |

URL options for testing: `?seed=11` fixes the spawn randomness (restart reuses it);
`?speed=8` runs the simulation 8× faster.

## Rules

- Three waves (16 s, 20 s, 24 s = 60 s). Survive all three to win; lose if the foundry hits 0 health.
- The cannon targets the enemy **closest to the wall** within range. A gold reticle and dashed line
  show its target. It never wastes a shot on an enemy that shots already in flight will kill.
- An enemy that reaches the iron wall **breaches**: it deals its damage and is destroyed.
- Armor is subtracted from **every hit** (minimum 1). Gold damage numbers landed in full;
  steel ones (with a shield) were cut by armor.
- After waves 1 and 2 the siege pauses and the furnace pays a fixed **80 ingots**. You may buy
  **one** upgrade per intermission. Unspent ingots carry over. Continue is always available.
- Enemies alive when a wave ends stay on the field and resume when the next wave starts.

### The two strategies

| | Faster Firing | Heavier Shot |
|---|---|---|
| Cost | 60, then 80 (two ranks) | 110 (one rank) |
| Effect | fire interval × 0.72 per rank (0.55 → 0.40 → 0.29 s) | +16 damage per shot (12 → 28) |
| Best against | swarms of Imps (wave 2) | armor (Clankers 3, Rams 5) |
| How to afford | buy at both intermissions | skip intermission 1 to bank 80, buy at 160 |

Buying Faster Firing first leaves 100 ingots at the second intermission, 10 short of Heavier Shot.
The half-and-half plan is unaffordable on purpose, and the card says why, naming the earlier purchase.
Each upgrade card shows the effect and, for every enemy type in the next wave, the time to destroy
one now and after the purchase.

## Where things live

| File | Role | Knows about |
|---|---|---|
| `src/config.js` | **All balance values**, in one labelled object | nothing |
| `src/sim.js` | Simulation: explicit state machine, economy, targeting, combat, end-of-run report. Pure; runs in Node too | config |
| `src/render.js` | Canvas drawing and cosmetic feedback (particles, numbers, shake, banner), reduced-motion handling | a read-only run |
| `src/ui.js` | DOM: HUD, timeline, start / intermission / result screens | a read-only run, sim helpers |
| `src/input.js` | Keyboard and mouse → plain actions (`primary`, `buy`, `restart`...) | nothing |
| `src/main.js` | Glue: owns the run, fixed-timestep loop, dispatches actions to sim | everything |

States are explicit (`start → wave → intermission → wave → intermission → wave → win | loss`,
restart from win/loss). `sim.ALLOWED` lists the legal moves and `setState` throws on anything else.
The UI's "why can't I buy this?" text and the purchase check both come from one function,
`sim.upgradeOffer`, so they cannot disagree.

## Tests

```sh
cd siege-foundry
npm test                 # unit tests: transitions, costs, refusals, currency >= 0, restart (Node 18+)
npm run balance          # 200 automated runs per purchasing policy, summary table
node tools/balance.js --detail   # plus per-run lines for the main policies
npm install && npx playwright install chromium && npm run smoke
                         # plays the real page in headless Chromium: win, loss, both
                         # intermissions, refusals, restart, 390 px width, reduced motion
```

Screenshots from the smoke test go to your temp directory (`SHOTS=dir` to choose).
