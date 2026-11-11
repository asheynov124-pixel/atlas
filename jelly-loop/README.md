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

- The picture is ringed by a **loop** with five **seats** (`LOOP_SEATS`). Below it is the **belt**,
  a tray with five **places** (`BELT_SLOTS`). Below that is the **hand**: columns of jellies, and
  only the front jelly of a column can be played.
- Tap a front jelly to send it round the loop. While it rides it holds a seat, not a place.
- In every row and column it passes, a jelly pops the outermost cube if that cube is its colour.
  Each pop costs one ammo. Total ammo per colour equals the cubes of that colour: nothing is spare.
- A jelly goes round once, then **lands** on a free place on the belt. Tap a landed jelly to send it
  round again; that frees its place. A jelly leaves the game when its ammo reaches zero.
- **A jelly that comes back to a full belt loses the round.** So the five places are the scarce
  thing: every jelly you send is a promise that there will be room for it when it returns.
- **Spent colours.** When the last cube of a colour pops, every jelly of that colour is retired
  wherever it is (hand, belt or loop), so it can no longer block anything.
- **Quick finish.** When the jellies left (hand, belt and loop together) fit in the loop's seats,
  they all launch and keep circling until the picture is clear. The round finishes itself.
- Clear every cube to win.

### Board pieces (from level 21)

- **Ice cubes** (a lowercase letter in `tools/levels.mjs`, drawn frosted): two hits. The first
  cracks the ice and leaves an ordinary cube. Hands are dealt with the extra ammo.
- **Crates** (`#`, drawn as wooden boxes): no jelly can shoot one, and it blocks its row and
  column. It breaks when a cube beside it pops; a Bolt or Firework smashes it too.
- **Mystery jellies** (`R8?` in a hand): grey with a `?` until they reach the front of their
  column. A Grabber can pull one out early, blind.
- The first round with a new piece opens with a card explaining it. If the quick finish ever
  goes two laps without a pop (something walled in by crates), the round ends as stuck.

## Home screen and the rest

An original design: every name, picture and number here is our own, and nothing costs real money.
Coins are earned only by playing.

- **Map.** Levels as a column of picture cards, the next one lit up, with icons for the pieces
  each level uses. Tap one for its card: picture, pieces, win streak, and pre-round boosters.
  The 30 hand-drawn levels in `tools/levels.mjs` come first; after them the game deals endless
  levels by mirroring and recolouring those pictures (`Deal.variant` in `src/deal.js`), freezing
  more cubes and hiding more jellies the further you go. Every hand, hand-drawn or endless, is
  checked winnable by a bot before you see it.
- **Daily Challenge.** One hard endless-style level a day, the same for everyone (seeded by the
  date). The first win each day pays 170 coins, 3 keys and a Wild Jelly; replays pay a little.
- **Stars and coins.** Stars are for speed against the bot's time (`par`): three stars at up to
  1.6x par, two at up to 2.4x. A win pays 20 coins, plus 15 for each star that is new for that
  level, plus a Star Road key (two for three stars).
- **Lives.** Five. Losing or quitting a started round costs one; one grows back every 15 minutes.
- **Boosters** (`BOOSTS` in `src/home.js`). Four are used during a round from the bar under the hand:

  | Booster | Price | Effect |
  |---|---|---|
  | Bolt | 60 | Tap a cube: it pops, with up to 10 touching cubes of its colour |
  | Grabber | 40 | Play any jelly you can see in the hand, not just the front one |
  | Squish | 50 | Landed jellies of the same colour merge, freeing places |
  | Extra Place | 70 | One more belt place this round; also revives a round lost to a full belt |

  Three are chosen on the level card before a round: **Firework** (50, pops 12 outside cubes),
  **Wild Jelly** (70, starts a jelly on the loop that pops any colour) and **Extra Seat** (40).
- **Win streak.** Each win in a row makes one more pre-round booster free (up to all three).
  A loss resets it.
- **Upgrades** (`UPGRADES`), permanent: Turbo Loop (3 levels, 60/120/200, loop 15% faster per
  level), Bigger Belt (300, six places), Wider Loop (250, six seats), Second Wind (2 levels,
  120/240, a jelly with nowhere to land goes back to the hand instead of losing, once per level).
- **Shop**, in four tabs:
  - *Deals*: a Daily Deal (one pack at 45% off, once a day), the Lucky Wheel, and four bundles
    (Starter Pack, Head Start Pack, Rescue Kit, Mega Box) at 12% to 33% off.
  - *Boosters*: each one singly, or five at a time for 20% less.
  - *Lives*: refill (100), 30 minutes unlimited (200), 2 hours unlimited (500).
  - *Looks*: six colour themes and five jelly faces (Classic, Rosy Cheeks, Sleepyhead, Starry
    Eyes, Cool Shades). Bought once, switched freely.
- **Lucky Wheel.** One free spin a day, up to three more at 80 coins. Eight prizes from 25 coins
  to a rare 400-coin jackpot (`WHEEL` in `src/home.js` holds the weights).
- **Daily tasks.** Four a day from `TASKS`, 25 points each; chests at 25, 50 and 100 points.
- **Daily gift.** A seven-day cycle of rewards (`GIFTS`), one claim a day.
- **Star Road.** Every three keys opens a step with a reward; the road repeats with bigger rewards.
- **Awards** (`AWARDS`): 21 goals, each paying once.
- **Stats** in Settings: levels, stars, wins, best streak, cubes, ice, crates, daily wins, spins.

Progress lives in the browser's `localStorage` under `jellyloop1`, so it is per device and is lost
if site data is cleared. Saves from every earlier version are upgraded on load (the old Queue Jump
upgrade becomes Grabbers, two per level bought). Levels 21-30 were added in front of the endless
levels: a save already past level 21 keeps its progress, the endless stars move up ten, and the
new levels appear behind it on the map marked NEW.

## What differs from the Unity prototype

- **Shooting.** The prototype fired only at path waypoints and looked three cells deep, so most of
  the board could never be reached. Here a jelly fires at the outermost cube of every lane it
  passes, which is the "real shooting logic" the original README listed as a next step.
- **One lap, then land.** The prototype's jellies circled forever. Here they do one lap and land on
  the belt, which is the "waiting slots" idea from the original README.
- **Hand.** Columns are queues: only the front jelly can be played. The prototype let any jelly be
  tapped, which leaves no puzzle.
- **Ammo.** The prototype's default hand (40/40/40/20...) could not clear its own test board. Hands
  are now dealt from the picture so the counts match exactly.
- **Losing.** The prototype had a lose panel but nothing that triggered it. A full belt does here.

## Layout

```
src/            the game as written: index.html, core.js (rules), deal.js (deals and checks hands),
                render.js, home.js (home screen and everything on it), app.js (round, input,
                saving), sw.js, icons
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
difficulty dial (`mix`). Endless levels are dealt the same way in the browser, the first time each
is opened.

To try it locally, serve `dist/` with any static file server and open it in a browser.

## Deploying

The Vercel project is `jelly-loop`, a plain static site with no build step and no Git connection.
A deploy is the eleven files in `dist/` uploaded as a production deployment. `build.mjs` prints each
file's size and SHA-1 so a deploy can be checked against the build.
