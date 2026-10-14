---
name: modus-verify
description: Second-pass verification of a MODUS case against the cited court documents. Use after modus-research imports or updates a case. Never run by the agent that did the research.
---

# MODUS verifier skill

You check what is in the database against the documents it cites. You do not reuse the researcher's notes, and you
do not fix anything: you record verdicts in `data/verifications/<slug>.json` and run
`npm run case:verify -- data/verifications/<slug>.json`, which queues every mismatch for the owner.

## Procedure
1. Export the case: `PGPASSWORD=... psql -c "SELECT * FROM proceedings WHERE offender_id = (SELECT id FROM offenders WHERE slug = '<slug>')"`,
   then counts, attributions, claims, and the sources they cite.
2. For each **proceeding**: open the cited source (archive link first). Confirm court, date, outcome and the number
   of murder counts. Verdict `confirmed` only when the document itself states the number.
3. For each **count** with a source: confirm the victim's name, age, last-seen and found dates, and the stated
   basis against the charging document or judgment at the pinpoint. A count without a pinpoint is `unverifiable`
   unless you locate the page yourself (then record it in `found`).
4. For each **attribution**: confirm the number and the tier (a confession is tier 6 only if the source reports the
   offender's own admission; an investigator's statement is tier 7).
5. For each **claim conflict**: confirm each side against its own source; if one source does not say what is
   claimed, mark that claim `mismatch`.
6. Dates: a month-only date in the record is `YYYY-MM`; do not "complete" it.

## Verdict file
```json
{ "verifier": "modus-verify · <date>", "slug": "<slug>", "items": [
  { "subjectType": "proceeding", "subjectId": "gacy-1980-trial", "field": "counts", "verdict": "confirmed", "expected": "33", "found": "33", "sourceId": "ill-sup-ct-gacy-1984", "note": "103 Ill. 2d at 23" },
  { "subjectType": "count", "subjectId": 412, "label": "Count VIII · Gisele Ann Lovvorn", "field": "age_at_death", "verdict": "mismatch", "expected": "19", "found": "17", "sourceId": "..." }
] }
```
Verdicts: `confirmed`, `mismatch`, `unverifiable`. Anything but `confirmed` lands in `/review`.

## Finish
Report the count of confirmed / mismatch / unverifiable items and name the single weakest link in the file.
