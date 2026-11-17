# Report: Lens

**Brief:** self-authored, with two answers from Adi: build both a showcase page
and an in-app plan, and write the page for friends and family. Facts about Lens
come from its own source. Data comes from Wikipedia and Wikidata, saved 17 Nov
2026. Nothing is invented: real page views, real search results, and Lens's
real rules, reproduced in the page.

**Grammar:** Live surface. The page is Lens, running. The other seven lost
because Lens's honest pitch is "watch what it does" (reasons in BRIEF.md).

**Signature move:** the Trail. A Trail button counts what you do on the page
(the steps you reach, how you got there, and anything you type into the phone).
It opens as a Lens-style sheet; each step jumps back, and each topic or search
opens in the real Lens.

**Fingerprint gate** against `sonny-and-adi`:

- Different on all six dimensions: grammar, nav, hero, act shape, close and
  signature move.
- Nav: the Lens tab bar jumps, plus a Trail badge, against a top bar and postmark.
- Hero: a live app surface already in a state, against an envelope.
- Act shape: 7 acts at 14.0 viewport-heights, against 6 at 12.9. The peak is the
  phone's screen opening out, and the pan sits before it.
- Close: a real search field, against a reply card.

What the two share: both have a fixed corner element that changes as you go
(the postmark, the Trail). They differ in that the Trail records the visitor's
own actions and input, can be navigated, and links out. The postmark only
re-stamped the author's chapters.

## Feeling curve: intended vs felt

| Act | Intended | Felt (cold scroll of the sheets) |
|---|---|---|
| Home | Welcome | Welcome. Calm, real |
| Search | Play | Amused: the Dawson's Creek and FBI-spy results land |
| Read + Save | Absorption | Absorbed; the paper wipe is the small delight |
| The Lens | Connection | Connection; the rail passes behind the phone |
| Story | Wonder (peak) | Wonder. Largest change, largest span (3.4) |
| Made | Warmth | Warmth, and a laugh at Grok |
| Try it | Invitation | Invitation. The close holds on a live input |

No act missed the curve. On phones, the help cards sit over the top of the
surface and cover the search field briefly in two acts. I accepted this so that
the Save sheet and the results, which sit lower, stay visible.

## Score

| Act | Device | Span |
|---|---|---|
| Home | pin; the surface's feed scrolls with progress | 1.7 |
| Search | flow + in; the surface types, misspells, corrects | natural (~2.3) |
| Read + Save | pin + reveal (Aa wipe to paper) + save sheet | 1.9 |
| The Lens | pan; the rail is synced to the Timeline in the phone | 2.4 |
| Story | pin + reveal from the phone's screen to the window | 3.4 |
| Made | flow + in; the phone shows your Trail | natural |
| Try it | pin, hold; a real input | 1.3 |

Length: 14.0 viewport-heights on desktop, 15.1 on a phone, 14.0 under reduced
motion.

## Verified

`shoot.mjs` was run at 1440×900, at 390×844, and with reduced motion. All three:

- no dead scroll;
- every cue reached full opacity and cleared 4.5:1 contrast at its worst frame;
- no console errors and no failed requests.

The first run caught one cue that never peaked. I widened its plateau and re-ran.

I also checked these by hand:

- Rail overflow is 2355px at 1440, 1850px at 1024 and 1730px at 390. Nothing
  overflows the page sideways.
- Clicking the tab bar jumps to the act. Only the destination is recorded, as
  "Tab bar".
- The Trail sheet opens with focus on Close, Escape closes it, and "Go" jumps
  back.
- Typing in the phone's field updates "Open “…” in Lens" to
  `#s/<query>` on the real app, and adds a "You typed it" step.

## Found along the way (for the plan)

1. **Spaceflights have no date in Lens.** `getFacts` reads P585, P580, P571 and
   P569. Missions carry P619 (launch date) instead: Sputnik 1, Explorer 1,
   Vostok 1, Apollo 8 and Apollo 11 all come back undated.
2. **Decade precision leaks into titles.** `fmtDate` prints the Mona Lisa as
   "c. 1503 (decade precision)", and the Story shows it in the big date line.
3. **Wikipedia's speller is odd.** "starry nite" is offered "starry nine". The
   *correct* "girl with a pearl earring" is offered "girl with a pearl earing".
   Lens's under-100 rule suppresses the second, but not the first: it has 65
   results and no exact page, so Lens would show "Did you mean starry nine?".

## Not verified

- Real phones (iOS Safari, Android Chrome). Headless Chrome only.
- New York only renders on Apple devices. Elsewhere the page falls back to
  Source Serif 4 and Inter.
- Live data. The page is a snapshot by design; the real app is linked.
