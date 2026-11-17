# BRIEF: Lens

**Self-authored, with two owner answers.** The request was "Use scroll craft to
create a better website for Lens". Adi answered two questions on 17 Nov 2026:

- *What to build:* "Both": a showcase page for Lens first, then a separate plan
  for scroll effects inside the app.
- *Audience:* "Friends and family": people Adi would show Lens to.

Everything else below is an authored decision, marked as such. Facts about Lens
come from its own source (index.html RULES, BRIEF and LOG; hub.js; find.js;
PLAN-search-home.md, Lap 3.6). Data in the page comes from Wikipedia and
Wikidata, fetched 17 Nov 2026 (feed for 20 Jul 2026).

## Evidence (from Lens itself, not invented)

- Lens is Adi's personal "Wikipedia on steroids": one reader, an iPhone Home
  Screen app, plain HTML, no accounts, no keys, saved data on the phone only.
- Screens: Home (cover story, Most read with real views, On this day, endless
  rows), Search (photos while typing, best match, Did you mean, topic filters,
  sorts, Surprise me), Article (Read, Watch, Sources, Context), Lenses (Timeline,
  Map, Gaps, Topics, Play Story), Reels, Story, Trail.
- Look: black by night, paper "reading room" by day (Aa switches), gold accent
  at night, ember on paper; small tracked labels over New York serif titles.
- It was built in a relay: Claude builds, Gemini designs, ChatGPT audits, Grok
  tries to break it (changing no code), Claude closes. Grok's file came back
  about 10 KB shorter despite "Changed: nothing" and would have stopped articles
  loading; Stage 5 started from ChatGPT's file instead.

## The eight topics (authored)

1. **Vibe:** a pocket museum at night. Quiet, exact, a little delighted.
   References: an iPhone held in a dark gallery; museum wall labels; the hush
   of a reading room.
2. **Journey:** open Lens on a morning → misspell a painting and get found →
   read it, then save it → see the Lens line up in time → play it as a Story →
   how Lens was made → try it yourself.
3. **Energy:** calm open, a playful lift at Search, quiet reading, a widening at
   the Lens, the full-screen peak, a warm laugh, a still close with a cursor.
4. **Feeling + one moment:** curve and peak below.
5. **The thing no site they've seen does:** the page *is* the app, and it keeps a
   Trail of what you did on it, the way Lens does: what you opened and how. You
   leave with a record, not a footer.
6. **Range:** product-honest, editorial-quiet. Lens's own design system, not a
   marketing skin.
7. **One world or scenes:** one surface (Lens) that never leaves the screen,
   whose state changes as you scroll. Scenes inside one app, not a flythrough.
8. **Assets:** no photography of Adi needed. Lens's own UI, rebuilt in markup,
   running on real Wikipedia data; public-domain paintings from Wikimedia
   Commons; one CC BY-SA bird photo (credited). No generation, no spend.

## Grammar: Live surface

The page behaves like the product: Lens's actual screens as real markup running
real logic (search rules, reading time, date sorting, Story order) on a saved,
clearly labelled copy of Wikipedia. Copy lives in the app's idiom: tracked
labels, serif titles, toasts, sheets, empty states. App chrome is the nav (the
Lens tab bar jumps). The hero is the surface already in a state (Home, 20 July).
The close is an actual input (Lens's own search field).

Why not the other seven: filmic one-shot would turn Lens into a commercial
about Lens; chaptered editorial forbids the product above the fold; continuous
world has no geography; typographic poster throws away the paintings; gallery
treats screens as exhibits instead of a thing you use; split stage has no two
sides; rhythmic cutlist is the wrong pulse for a reading app.

Bans held: scrub, kinetic headlines, spotlight, magnet, drift past two stops,
marketing bar, full-bleed hero claim, scroll cues, section counters.

## Feeling curve

```
1  Welcome     Lens opens on a real morning: a bird on the cover, what the world read   (pin; surface feed scrolls)
2  Play        you misspell "perl earing"; Wikipedia's results are nonsense; Lens asks
               "Did you mean". Then the right painting, big                             (flow + in; surface types)
3  Absorption  the article, then Aa turns the screen to paper; Save, into a Lens        (pin + reveal wipe to paper)
4  Connection  six paintings line up in time as the rail slides past the phone          (pan, synced to Timeline)
5  Wonder      PEAK. The phone opens out to fill the screen and plays the Lens as a
               Story, Botticelli to Van Gogh, one painting per screen                   (pin + reveal from the phone's screen)
6  Warmth      four AIs built it in a relay; Grok "changed nothing"                     (flow + in; Trail sheet in the phone)
7  Invitation  the phone shows Search with a cursor in it; type anything                 (pin, hold; real input)
```

No two neighbours share a feeling. Silence before the peak: act 4 ends on a
held still rail (the last card) so the opening of act 5 is a change.

## The peak

> "the phone opened out to fill the whole screen and played the paintings in
> order, Botticelli, Rembrandt, Velázquez, Vermeer, Monet, Van Gogh"

Act 5. It gets the paintings at full resolution, the largest span on the page,
and the only full-frame image.

## Tell-someone

> It's the site where you use Adi's app just by scrolling: you misspell a
> painting, it works out what you meant, you save it, and then the phone opens
> up and plays five centuries of paintings as a story. A Trail button counts
> everything you did, and you can open any of it in the real app.

## Signature move: the Trail you leave

Lens's Trail records the pages you opened and how. The page keeps one too: a
Trail button (Lens's own, with its badge) records each step as you reach it,
including how you got there ("Scrolled", "Tab bar", "You typed"), and anything
you type into the phone's search field. Opening it lists your steps; each jumps
back to that place, and each topic opens in the real Lens. In act 6 the phone
shows the same Trail sheet. Distinct from the wedding postmark: the postmark
stamped the author's chapters; the Trail records the visitor's own actions,
including input, and is navigable and actionable.

## Authored silence

None. The quiet before the peak is the held last rail card, not an empty screen.

## Layer contract (hero)

| Plane | What | Movement | Rule |
|---|---|---|---|
| Ground | off-black gallery wall with grain | still | never pure black; the phone's screen is |
| Subject | the phone: Lens Home, 20 July | holds; its feed scrolls inside with progress | always fully on screen on desktop |
| Near | annotation column (label, serif title, one line) | cues cross over | never crosses the phone |
| Chrome | Trail button with badge | fixed | starts at 1 ("Opened Lens") |

Mobile: no phone frame. The surface is the whole screen (it is a phone), and
annotations arrive as Lens-style glass help cards above the tab bar.

## Honesty

Every panel is markup computing its state from data arrays in the page. A status
line in the surface says the data is a saved copy of Wikipedia. Lens's real
rules are reproduced, including "Did you mean" (only under 100 results and no
page with that exact name) and reading time (words ÷ 230). Paintings were
chosen because today's Lens dates them cleanly (see the plan for the two date
bugs this build found).
