# Research notes — caveats and source conflicts

Reconstructed from the kickoff chat and the approved artboards. Read before importing anything.

## Ridgway (King County No. 01-1-10270-9 SEA)

- **Count labels.** 48 counts are the Roman numerals of the 2003 Second Amended Information. The 49th
  (Rebecca Marrero) was a separate 2011 plea and is labelled `2011`.
- **Lovvorn's age.** 19 in the Prosecutor's Summary of the Evidence; 17 on Wikipedia. The record value (19)
  drives the display; both are stored as claims and the page flags the conflict.
- **Count XLVII (Patricia Yellowrobe).** The medical examiner ruled the death an overdose and hair DNA
  excluded Ridgway. The conviction rests on the confession alone. Found 1998, inside the 1987–2001 window.
- **Jane Does.** Four counts were pleaded as Jane Does (B10, B16, B17, B20) and identified 2012–2024
  (Major 2012, Stephens 2021, Razpotnik 2023, Liles 2024). Keep the Doe label with the name.
- **Partial dates.** Several last-seen and found dates are month-only in the record (stored as `YYYY-MM`).
  Two counts (Stephens, Razpotnik) and Yellowrobe have no last-seen date: store null, show "not established".
- **Bush and Sherrill.** Remains moved to Tigard, Oregon in spring 1984; off the Puget Sound map.
- **Pinpoint cites.** Per-count page references into the Prosecutor's Summary are not yet attached
  (review-queue items). The summary is 138 pages; the Seattle Times links are archive copies.
- **Recovery-site positions** are approximate to the named site; points sharing a site are fanned out.

## The other 30 offenders

- Figures (court-proven, attributed, years, how caught) were verified in the research chat; the citations did
  not survive into the repo. Every proceeding row is imported with `source_id = null` and queued.
- **Samuel Little:** 8 convictions against 93 confessions, the widest gap in the set. Confessions are tier 6.
- **Israel Keyes:** died in custody 2012, never tried; attributed 11 (investigator attribution, tier 7).
- **Alan Wade Wilmer Sr.:** died 2017; named by posthumous DNA (tier 5, cleared by exception), attributed 6.
- **Ted Bundy:** 3 convictions (Florida) against ~30 attributed; the attributed figure is his own confessions
  plus investigator attributions.
- **States** for Little ("15 states") and Keyes ("AK VT +") are not enumerable from the seed: stored as a note.
- **Unidentified cases** have no proceedings; their counts are attributions at tier 7 (investigator) and the
  status is `unidentified`.

## MAP (Murder Accountability Project)

- Source file: SHR 1980–2014, 638,454 homicides, 143,345 female victims, 33,076 unsolved (23.1%).
- Method: group female victims by county and weapon; flag when victims ≥ 6 and solved share ≤ 1/3.
  Full-period lens gives 54 flags, 53 involving no gun.
- Florida's rows stop around 1987. Weapon "other/unknown" partly reflects agencies that report weapons poorly.
- MAP says Ridgway's victims were coded with weapon "other/unknown"; King County female other/unknown in the
  1980s: 6 solved of 47 (12.8%) against 76.9% for all US female victims 1980–2014.
- The 1976–2025 file could not be downloaded from the workspace (site blocked). The owner should fetch it.
- A flag is a reason to look, not a finding.
