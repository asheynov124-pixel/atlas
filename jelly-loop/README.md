# Jelly Loop

A phone-sized puzzle game: send coloured jellies round a conveyor belt and they pop the cubes of
their own colour, one picture at a time.

**Play:** https://jelly-loop.vercel.app (on a phone: Share, then *Add to Home Screen*)

This folder is unrelated to the Atlas app in the rest of the repository. It lives here only so the
source is kept somewhere; move it to its own repository whenever that suits.

## Where it came from

`unity-original/` holds the eight Unity C# scripts this started from. They had no scene, prefabs or
project settings, so Unity could not build them. `src/` is a port of the same rules to plain
JavaScript and canvas, which runs in any browser and installs as a home-screen app.

| Unity script | Here |
|---|---|
| `ColorTypes.cs` | `PALETTE` in `src/core.js` |
| `Cell.cs`, `BoardManager.cs` | `Game.grid`, `firstInLane`, `exposed` |
| `Jelly.cs` | jelly objects in `hand`, `pending`, `belt` |
| `ConveyorManager.cs` | `Game.step`, `fire`, the lane triggers |
| `HandManager.cs` | `Game.hand` |
| `GameManager.cs` | `Game.send`, `status`, `checkJam` |
| `LevelData.cs` | `tools/levels.mjs` |

## Rules

- Tap the front jelly of a column to play it. It takes one of the five places on the **belt**
  (`MAX_SLOTS`) and sets off round the **loop** that circles the picture.
- A jelly goes round the loop once. In every row and column it passes, it pops the outermost cube
  if that cube is its colour. Each pop costs one ammo.
- After one lap it parks in its place on the belt. Tap a parked jelly to send it round again.
  A jelly only leaves the belt, and frees its place, when its ammo reaches zero.
- So the belt is the scarce thing: every jelly you play holds a place until it is used up, and
  one whose colour is buried just sits there. Choosing which five to have out is the game.
- Clear every cube to win. Total ammo per colour equals the cubes of that colour, so nothing is spare.
- If every place is taken and no jelly in play matches any cube on the outside, the belt is
  jammed and the level is lost.

## Home screen, coins, upgrades and awards

The game opens on a home screen with three tabs. This is an original design; it does not copy the
screens, upgrades or awards of any other game.

- **Levels.** Each cleared level shows one to three stars. Stars are for speed, measured in belt
  seconds against the time the build bot took (`par` in `src/levels.js`): three stars at up to
  1.6x par, two at up to 2.4x.
- **Coins.** A win pays 10, plus 15 for every star that is new for that level. Awards pay once each.
- **Upgrades** (`UPGRADES` in `src/home.js`), bought with coins and applied from the next round:

  | Upgrade | Levels | Cost | Effect |
  |---|---|---|---|
  | Turbo Loop | 3 | 60, 120, 200 | Jellies travel the loop 15% faster per level |
  | Queue Jump | 3 | 80, 160, 260 | Play the second jelly of a column; one use per round per level |
  | Second Wind | 2 | 120, 240 | A jam sends the fullest jelly back to the hand instead of ending the round |
  | Sixth Slot | 1 | 300 | Belt has six places |

- **Awards** (`AWARDS` in `src/home.js`): 13 goals such as clearing every level, collecting stars,
  popping 3,000 cubes or a 30-pop chain. Each has a `have()` and a `goal`; add one by adding a row.

Progress lives in the browser's `localStorage` under `jellyloop1`, so it is per device and is lost
if site data is cleared. Saves from before this screen existed are upgraded on load.

## What differs from the Unity prototype

- **Shooting.** The prototype fired only at path waypoints and looked three cells deep, so most of
  the board could never be reached. Here a jelly fires at the outermost cube of every lane it
  passes, which is the "real shooting logic" the original README listed as a next step.
- **One lap, then park.** The prototype's jellies circled forever. Here they do one lap and park
  on the belt until tapped again, which is the "waiting slots" idea from the original README.
- **Hand.** Columns are queues: only the front jelly can be played. The prototype let any jelly be
  tapped, which leaves no puzzle.
- **Ammo.** The prototype's default hand (40/40/40/20...) could not clear its own test board. Hands
  are now dealt from the picture so the counts match exactly.
- **Losing.** The prototype had a lose panel but nothing that triggered it. The jam rule above does.
- **Levels.** Eleven pictures. Level 1 is the prototype's procedural test board at phone size.

## Layout

```
src/            the game as written: index.html, core.js (rules), render.js, home.js (home screen,
                upgrades, awards), app.js (loop, input, saving), sw.js, icons
src/levels.js   generated - do not edit
dist/           minified copy of src/; this is exactly what is deployed
tools/          levels.mjs (the pictures), build.mjs, make-icons.py
unity-original/ the scripts this was ported from
```

## Changing it

```
cd jelly-loop/tools && npm install     # once; installs the minifier
node build.mjs                         # deals hands, proves each level winnable, sets par, writes ../dist
```

To add a level, draw it in `tools/levels.mjs` and run the build. For each picture the build finds
an order that clears it, shuffles that order into queue columns, and has a bot play the result; it
fails if any level cannot be won. It also prints how often careless play loses, which is the
difficulty dial (`mix`).

To try it locally, serve `dist/` with any static file server and open it in a browser.

## Deploying

The Vercel project is `jelly-loop`, a plain static site with no build step and no Git connection.
A deploy is the ten files in `dist/` uploaded as a production deployment. `build.mjs` prints each
file's size and SHA-1 so a deploy can be checked against the build.
