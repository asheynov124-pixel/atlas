---
name: modus-research
description: Find, source and import one serial-murder case into MODUS as a case file with evidence tiers. Use when asked to add an offender, attach citations to an existing dossier, or update counts after a new court result.
---

# MODUS research skill

You are producing `data/cases/<slug>.json` (schema: `data/cases/SCHEMA.md`) and importing it with
`npm run case:import -- data/cases/<slug>.json`. You never write to the database by hand.

## The rule that matters most
Every fact carries its source and its evidence tier. Never invent a fact, date, count, quote or source.
If something cannot be established, write `null`; the app shows "not established."

## Order of research (stop at the first tier that answers the question)
1. **Court records.** Charging documents, plea statements, judgments, appellate opinions. Search CourtListener
   (`search` with type `o` for opinions, `r` for RECAP dockets); read with `read_document`. State appellate
   opinions usually recite the counts, dates and victims: cite the opinion with a pinpoint page.
2. **Agency pages.** Sheriff, DA, state police, FBI releases: for unidentified-victim identifications and attributions.
3. **Datasets.** Murder Accountability Project for clearance context; Radford/FGCU database for a starting list only.
4. **Reporting.** Named outlets with a date and author. An encyclopedia (Wikipedia) is tier 8 at best and must be
   replaced by its own cited source where possible.

## What to write
- `proceedings`: one row per court outcome, with `counts`, `outcome`, `tier` (1 for a verdict, 2 for a plea),
  `sourceId` and a `pinpoint`. Acquittals and vacaturs are their own rows (negative effect on the total).
- `counts`: victim-level rows only when the charging document or judgment is in hand; they must add up to the
  proceeding. Recovery sites are named places, never street addresses.
- `attributions`: the highest credible total with its tier (confessed_uncharged, investigator_attributed, ...).
- `claims`: any field where two sources disagree, one claim per source. Do not pick a winner; the app shows both.
- `events`: investigation / forensics / court lanes, dated, each with a source.
- `documents`: every source id that should appear under "Court records & sources".

## Privacy and defamation
- A living person who was never charged is `legalStatus: "named_in_reporting"` with no proceedings, and the
  dossier says only "named in reporting by [outlet]".
- Minors are named only where the court record names them.
- No victim home addresses. Crime-scene images are never attached; booking photographs only with a public-record
  source and credit line recorded in `vitals`.

## Finish
1. `npm run case:import -- data/cases/<slug>.json` (the importer refuses invalid tiers, unreconciled counts and
   unsourced ids; fix the file, not the importer).
2. `npm run case:verify` and read the review queue at `/review`.
3. Hand the slug to the **modus-verify** skill. Do not verify your own research.
4. Report: proven / attributed as the importer printed them, and the weakest source in the file.
