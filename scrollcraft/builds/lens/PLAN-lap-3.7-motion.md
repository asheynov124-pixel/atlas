# Lens Lap 3.7 plan: fix the dates, then bring the showcase's motion home

Draft v1, 17 Nov 2026. Builder: Claude. Owner: Adi (judges by using it on his
iPhone). Written after building the Lens showcase page with scroll-craft
(`scrollcraft/builds/lens/`). That build used real Wikipedia data, and in doing
so found two date bugs and one spelling-suggestion bug in Lens today.

> **Update, 17 Nov 2026.** The showcase page was dropped at Adi's request; the
> bugs it found (§2) still stand. Release 3.6A2 then shipped the restrained
> version of the motion: CSS scroll-driven, article page and Lens Timeline only
> (the photo settles, the reading hairline = M4, the Timeline line draws and
> events arrive). M1–M3 below are not built and are optional.

## 1. Goal

Take the four moments that made the showcase feel alive and put them in the
app, where they belong to Adi's own Lenses. Fix the dates first, because three
of those four moments are about time.

Success means four things:

- A Lens of space missions plays its Story in launch order.
- The Mona Lisa's date reads "1500s", not "c. 1503 (decade precision)".
- Pressing Play Story opens the Story *out of* the button you pressed.
- Aa turns the page to paper with a wipe, not a blink.

## 2. What the showcase found (the needles)

**F1. Spaceflights have no date.** `getFacts` (index.html) reads `P585` (point
in time), `P580` (start time), `P571` (inception) and `P569` (birth date). Space
missions carry `P619` (UTC date of spacecraft launch) instead. Checked on
Wikidata on 17 Nov 2026:

| Topic | What it has | What Lens shows |
|---|---|---|
| Sputnik 1 | P619 1957-10-04 | No date |
| Explorer 1 | P619 1958-02-01 | No date |
| Vostok 1 | P619 1961-04-12 | No date |
| Voskhod 2 | P580 1965-03-18 | 18 Mar 1965 |
| Apollo 8 | P619 1968-12-21 | No date |
| Apollo 11 | P619 1969-07-16 | No date |
| Apollo–Soyuz | P580 1975-07-15 | 15 Jul 1975 |

A "Space Race" Lens today would put five of its seven topics under "No date",
and its Story would play 1965, 1975, then the undated ones. The same gap
probably hits:

- films, books and albums, which carry `P577` (publication date);
- plays and operas, which carry `P1191` (first performance);
- aircraft, which carry `P606` (first flight).

This list is unverified; it is what the probe in §6 checks.

**F2. Saved dates don't heal.** The date is stored in `lens.v1` when a topic is
saved. Fixing `getFacts` alone helps only *new* saves. Adi's existing undated
topics stay undated until each one is saved again.

**F3. Decade and century precision leak into the UI.** For `prec < 9`,
`fmtDate` prints "c. 1503 (decade precision)". The Story puts that string in
its big date line. Expected: "1500s" for a decade, "16th century" for a
century, and the year for anything finer.

**F4. "Did you mean starry nine?"** For "starry nite", Wikipedia's speller
suggests "starry nine". There are 65 results and no exact page, so Lens's
under-100 rule lets it through. (The rule does correctly suppress Wikipedia's
odder suggestion for the correctly spelled "girl with a pearl earring", which is
"girl with a pearl earing".)

## 3. Goals and non-goals

**Goals**
- **D1.** Read more Wikidata date properties.
- **D2.** Backfill dates for topics already saved.
- **D3.** Format dates honestly at each precision.
- **D4.** A sturdier "Did you mean".
- **M1.** Story opens out of the button you pressed.
- **M2.** The Aa wipe.
- **M3.** The Lens Timeline as a sideways rail.
- **M4.** A reading-progress hairline in articles.

**Non-goals**
- No scroll-jacking. Nothing pins the page or turns the wheel or a swipe into a
  timeline. In an app you scroll to *read*. On iPhone, pinned acts fight
  momentum scrolling, the bounce, and Back-restore.
- The scroll-craft engine stays out of Lens. RULE 5 says no libraries, and Lens
  needs none of the engine's devices.
- Video scrubbing, parallax rows on Home, and new screens are out.
- The `lens.v1` format does not change. D2 only fills a field that already
  exists.

## 4. The plan

### Part A: dates (ship first; no motion)

**D1. More date properties** (`getFacts`, index.html). Read the start date in
this order:

1. `P585` point in time;
2. `P580` start time;
3. `P619` launch date (new);
4. `P606` first flight (new);
5. `P1191` first performance (new);
6. `P577` publication date (new);
7. `P571` inception;
8. `P569` birth date.

Launch, first-flight and premiere dates rank above inception, because inception
on a spacecraft or a film is usually when work *began*.

Read the end date in this order: `P582`, then `P576`, then `P570`, then `P620`
(landing date, new) for missions.

**D2. Backfill when a Lens opens** (`showLens`).
- For topics with no date, and only those, call `getFacts` again: at most 10 per
  opening, in the background, through the existing 5-in-flight queue.
- Write the result with `transact()`, which already validates.
- Show a toast only if something changed: "Dated 4 topics".
- Never overwrite an existing date.

**D3. Honest precision** (`fmtDate` and hub.js `shortDate`).

| Precision | Example | Shows |
|---|---|---|
| 8 (decade) | 1503 | "1500s" |
| 7 (century) | 1503 | "16th century" |
| 6 (millennium) | | "2nd millennium" |
| below 6 | | "c. 1 million years ago" |

BCE years keep their suffix. The Timeline's sort key does not change.

**D4. Did you mean, checked.** Before showing a suggestion, run one cheap
`list=search&srlimit=1&srinfo=totalhits` for the suggestion itself. Show it
only if the suggestion has at least 5 times the hits of what was typed.
- This catches "starry nine" if the probe shows it is thin, which still needs
  checking.
- It costs one request, and only on the rare searches that get this far.
- If that request fails, don't show the suggestion.

### Part B: motion (each piece self-contained, each off under Reduce Motion)

**M1. Story opens out of the button.**
- On Play Story, measure the button's (or Lens cover card's) rectangle.
- Show the Story full screen with `clip-path: inset(...)` set to that rectangle,
  then animate it to `inset(0)` over 380 ms with the house ease-out
  (`cubic-bezier(.23,1,.32,1)`).
- Close runs it in reverse, back to the button, if the button is still on
  screen; otherwise it plain-fades.
- This is the showcase's peak, scaled to an app: one element, `clip-path` only,
  no layout animation.
- Files: hub.js (`showStory` entry and close), hub.css (one class).

**M2. The Aa wipe.**
- When Aa changes the theme, use `document.startViewTransition` where it
  exists (iOS 18 and later). The new theme wipes down from the top:
  `::view-transition-new(root)` animates `clip-path` from `inset(0 0 100% 0)`
  to `inset(0)` over 420 ms.
- Elsewhere, and under Reduce Motion, the theme changes instantly, as it does
  today.
- The status-bar colour still follows the theme (`theme-color`).
- Files: room.js (the Aa handler), room.css.

**M3. The Timeline rail** (a fifth Lens pane, "Rail", next to Timeline).
- Topics in date order as big photo cards, swiped sideways using native
  horizontal scroll and `scroll-snap-type: x mandatory`.
- The year of the centred card sits large above the rail.
- No scroll-driven transforms. The only motion is the browser's own scroll.
  That is the point: it feels like the showcase's rail and costs no
  scroll-jacking.
- Undated topics go in a final "No date" card.
- Files: index.html (`panes` map plus one function), hub.css.

**M4. Reading hairline.**
- A 2 px accent bar under the article's top bar fills as you read.
- It reuses the fraction that Continue reading already computes (`lens.read`).
- It updates in the existing scroll-end handler only, so there is no new
  per-frame work.
- It is hidden on articles shorter than two screens.
- Files: index.html (article view), hub.css.

**Order of work:** D1 → D3 → D2 → D4 → M1 → M2 → M4 → M3. That puts cheapest
and most certain first.

## 5. Key decisions and rejected alternatives

- **Dates before motion.** M1 and M3 are about time. Shipping them while five
  of seven missions sit under "No date" would put the bug on a stage.
- **Rejected: bringing in `scrollcraft.js`.** It breaks RULE 5, and the app
  needs one `clip-path` and one view transition, not an engine.
- **Rejected: a pinned, scroll-driven Story or Home.** It fights iOS scrolling,
  and it breaks Back-restore by row (Lap 3.6).
- **Rejected: rewriting saved dates wholesale.** D2 fills blanks only. Never
  overwriting means a bad Wikidata edit can't damage a Lens Adi has curated.
- **Rejected: a "Did you mean" blocklist.** It's brittle. The hits comparison
  in D4 is general.

## 6. Risks and verification

**Weakest point: D1's property order.** Some items carry several of these
properties, and "first match wins" could pick the wrong one. For example, a
book with both an inception date and a publication date.

Mitigation: a live probe on the preview deploy, as in Lap 3.6. Fetch the facts
for about 20 mixed topics and check each date by eye before release:

- Sputnik 1, Apollo 11, Vostok 1;
- Casablanca (film), Hamlet, Abbey Road;
- Concorde, the Mona Lisa, the Eiffel Tower;
- Napoleon, the Battle of Waterloo, the October 7 attacks;
- and others.

**Other risks**
- **M2 view transitions on older iOS.** Feature-detected; the fallback is
  today's behaviour.
- **M1 when the button has scrolled away.** It falls back to a fade.
- **D2 request load.** At most 10 per Lens opening, through the existing queue,
  and only for undated topics.
- **D4's extra request.** It happens only when a suggestion would otherwise
  show.

**Checks**
- **Smoke tests** (tests/smoke.js). New mocked checks:
  - the property order (P619 beats P571);
  - the end date from P620;
  - backfill only fills blanks;
  - formats at precisions 6, 7, 8 and 9;
  - D4 suppresses a thin suggestion and keeps a strong one;
  - the Rail pane renders in date order;
  - each motion piece is off under Reduce Motion (mocked).
- **Screenshots** at 390×844 in both themes:
  - a Space Race Lens (Timeline, Rail and Story);
  - mid-wipe on Aa;
  - M1 at 0 %, 50 % and 100 %;
  - the hairline.
- **Adi on his phone:** Play Story feel, the Aa wipe, the Rail swipe, and
  whether old Lenses gain dates after opening them once.

## 7. Open questions for Adi

1. Ship Part A (dates) on its own first? Recommended: yes. It is invisible
   until it fixes something.
2. Should "Rail" be a fifth tab in a Lens, or replace Timeline?
   Recommended: a fifth tab.
3. Should D2 backfill silently, or show "Dated 4 topics"? Recommended: show it,
   so the fix is visible once.
4. Is the Aa wipe wanted? It is the most decorative item. Recommended: yes, but
   say so if you'd rather keep it instant.
