# Report: Sonny & Adelin

**Brief:** self-authored under explicit creative delegation ("make it
beautiful"). All facts and the story are the couple's own, from their Zola
site. Em dashes in their copy were replaced with commas or periods. Nothing is
invented: no RSVP (their site has none), no numbers except the real date,
times and a live countdown.

**Grammar:** Stationery suite (new, defined in BRIEF.md). The other eight lost
because a wedding site is read the way a guest reads a printed suite:
invitation, story, the evening card, details, reply card.

**Signature move:** the postmark. It re-stamps with each chapter's place or
date, adds one cancellation wave per chapter, stamps YES at the proposal, and
ends on the live day count.

**Fingerprint gate:** first row in this workspace, so there was nothing to clear.

## Feeling curve: intended vs felt

| Card | Intended | Felt (cold scroll of the contact sheets) |
|---|---|---|
| Invitation | Anticipation | Anticipation, then delight as the card turns upright |
| Our story | Warmth | Warmth |
| Proposal | Joy (peak) | Joy. Largest visual change and largest span (3.2vh) |
| The evening | Excitement | **Orderly** rather than excited. It is a timeline. |
| Good to know | Ease | Ease |
| Reply card | Resolve | Resolve. The close holds |

The one miss is the evening card. It reads as a calm, clear schedule, which is
honest for logistics but flatter than intended. Not changed in this pass.

## Score

| Card | Device | Span |
|---|---|---|
| Invitation | pin, page-local envelope choreography (5 planes, pointer lean) | 2.2 |
| Our story | flow + parallax photos | natural |
| Proposal | pin + iris reveal from the ring + cues | 3.2 |
| The evening | pan (timeline rail, staggered settle) | 2.6 |
| Good to know + registry | flow + in | natural |
| Reply card | pin, hold | 1.25 |

Total length: 12.9 viewport-heights desktop and phone, 10.5 under reduced motion.

## Verified

- `shoot.mjs` at 1440×900, at 390×844, and with reduced motion: no dead scroll,
  all cues ≥4.5:1 at their worst frame, no console errors, no failed requests.
- Rail overflow measured (1440: 1022px, 390: 1292px, 360: 1205px). No page
  overflow on the x-axis.
- Contact sheets read by eye: `lab/sheets/` (`shots`, `mobile`, `reduced`,
  `showcase`).
- `.ics` file is served and well-formed: 6:30 pm to midnight EDT, written in UTC.

## Not verified

- A real phone (iOS Safari, Android Chrome). Headless Chrome only.
- Keyboard tab order through the evening rail.
- Google Fonts loading on a slow network. Georgia is the fallback.
- No hosting is set up. This is a static folder, served locally on port 4500.
