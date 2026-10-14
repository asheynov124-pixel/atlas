# MODUS — build specification (reconstructed)

> **Provenance.** The original `SPEC.md` shipped inside `modus-seed-v1.zip`, which never reached this
> repository or Drive. This file is a reconstruction from (a) the kickoff chat that summarised the spec and
> (b) the four approved artboards on the "Serial Killer Database Layouts" canvas, whose embedded data and
> copy are the verified research. Where the chat was silent, the choice is recorded in `DECISIONS.md`.
> Nothing here invents a fact about a case.

## 1. What MODUS is

A private research app on American serial killers, known and unknown: a database with sourced dossiers,
real data visualisation, and Wikipedia-style links that send the reader from one case to the next.

The one rule that matters most: **every fact carries its source and its evidence tier.** A court finding
must never look like a rumour, and a rumour must never look like a court finding.

## 2. Evidence model

### 2.1 Tiers (highest to lowest)

| # | Tier id | Meaning |
|---|---|---|
| 1 | `convicted_at_trial` | Guilty verdict by a court |
| 2 | `guilty_plea` | Plea accepted by a court |
| 3 | `charged_pending` | Charged, not yet tried |
| 4 | `charged_died_before_trial` | Charged, died before verdict |
| 5 | `cleared_by_exception` | Police closed the case on a named person who cannot be charged (e.g. posthumous DNA match) |
| 6 | `confessed_uncharged` | Admitted by the offender, never charged |
| 7 | `investigator_attributed` | Attributed by police, a task force or a prosecutor without charge |
| 8 | `named_in_reporting` | Named in reporting by an identified outlet |
| 9 | `researcher_suspected` | Author, researcher or algorithmic (MAP) suspicion |
| 10 | `rumored` | Everything weaker |

Only tiers 1–2 are **court results**. They are the only tiers that count toward a "proven" total.

### 2.2 What a conviction rests on (per count)

`physical` (DNA or trace such as factory paint), `led_to_remains` (the offender led investigators to the
remains), `confession` (confession and site knowledge), `witness`, `other`. Boolean flags record DNA,
paint, led-to-remains and partial remains individually.

### 2.3 Totals are computed, never typed

- `proven` = Σ counts over proceedings with outcome `guilty_plea` or `conviction`, minus counts later
  `vacated` or resolved by `acquittal`. It is a SQL view over `proceedings`, and where victim-level `counts`
  rows exist they must reconcile to the proceeding's count (tested).
- `attributed` = max(`proven`, highest credible attribution claim). Each attribution row carries its tier
  and source.
- An acquittal or vacatur is a new `proceedings` row; the totals update immediately.

### 2.4 Source conflicts are a feature

Any field may carry several `claims`, each with a value, tier and source. When two sources disagree
(Lovvorn's age: 19 in the prosecutor's summary, 17 on Wikipedia) the page shows both, flagged, and the
higher-tier value drives the display.

### 2.5 Null means not established

Never invent a fact, date, count, quote or source. If something cannot be established, store `null` and
show **"not established."**

## 3. Content

- **Dossier** (`/case/[slug]`): caption (case name and number), name, alias, lede, status chips, key-figure
  tiles, case vitals, "Vanished, recovered, identified" timeline with the investigation on the same clock,
  recovery-site map, what the convictions rest on, age at death, the MAP lens, how they were caught,
  per-count sections (what the record establishes, evidence on this count, sources), the ledger table,
  connections, court records and sources. Match `design/` exactly.
- **Index** (`/index`): 31 cases at launch. Query/sort/facets; tiles (299/593 etc. computed); careers on one
  clock; proven vs attributed; how they were caught; the all-cases table.
- **Atlas** (`/atlas`): the Murder Accountability Project clusters. Lens full/decade, threshold controls
  (min victims, max share solved), layers (flagged clusters, offender home bases, all counties, non-reporting
  years), ranked list, decade table, unsolved by decade and by weapon. Must reproduce the same 54 flagged
  clusters from the raw file.
- **Unidentified**: the never-named cases, as index rows and dossiers with `unidentified` status.
- **Court records**: every document cited anywhere, with archive links.
- **Links**: every link names the trait it shares with the current file (same method and victims, same
  state, old evidence new science, same pattern no name). Computed from data, not hand-written.

## 4. Privacy and defamation rules

1. Living people never charged appear only as "named in reporting by [outlet]" (tier 8), never as offenders.
2. Acquittals and vacaturs update the counts immediately (new proceeding row).
3. No victim home addresses. Recovery sites are named places, positions approximate to the named site.
4. Crime-scene photos are blurred until tapped. Booking photos only with a licence recorded; empty slots are
   acceptable.
5. Minors are shown by name only where the court record names them.

## 5. Stack

Next.js (App Router, TypeScript) on Vercel. Postgres on Neon (PostGIS enabled when available; county
geometry via `us-atlas` on the client otherwise). Drizzle ORM. Single app password (middleware). Installable
PWA that caches the last 25 opened dossiers for offline reading. Local development on Postgres 16.

## 6. Research process

A reusable skill (`skills/modus-research/`) finds and imports new cases: it writes offenders, proceedings,
counts, claims and sources with tiers. A second, independent verifier pass checks every count against the
cited court documents and never reuses the researcher's notes. Anything unconfirmed lands in the review
queue (`/review`) for the owner.

## 7. Phases and their fixed tests

| Phase | Deliverable | Test that must pass |
|---|---|---|
| 0 | Repo, scaffold, docs, seed files | Seed JSON reproduces 49 / 5-4-40 / 19 minors; 299 / 593; 54 clusters |
| 1 | Schema, import, computed totals | Same numbers from SQL views; counts reconcile to proceedings |
| 2 | Dossier, index, atlas, phone layout | Pages render those numbers from the DB; design matches artboards |
| 3 | Links, search, PWA offline, password | Link groups computed; 25 dossiers readable offline; gate holds |
| 4 | Research skill, verifier, review queue | A new case imports with tiers; unverified items queue |
| 5 | Vercel + Neon deploy; MAP 1976–2025 import | Preview link; atlas re-derives the 54 clusters from the raw file |

## 8. Data sources at launch

- Ridgway: Prosecutor's Summary of the Evidence (2003), Second Amended Information (48 counts), Plea
  Agreement (2003-06-13), Statement of Defendant on Plea of Guilty (2003-11-05), King County Sheriff's Office
  Green River page, The Seattle Times documents index. Plea of 2011-02-18 for the Marrero count.
- 30 further offenders: figures verified in the research chat; citations to be attached by the research skill
  (see `data/notes/research-notes.md`).
- MAP: Supplementary Homicide Report 1980–2014 file (638,454 homicides); the 1976–2025 file to be downloaded
  by the owner (download site blocked from the workspace).
