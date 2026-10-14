# Case file schema (`data/cases/<slug>.json`)

One JSON file per offender, written by the research skill and read by `npm run case:import -- data/cases/<slug>.json`.
Every fact-bearing object carries `sourceId`. A fact with no source is stored as `null` and queued for review.

```jsonc
{
  "offender": {
    "slug": "john-wayne-gacy", "name": "John Wayne Gacy", "shortName": null, "alias": null,
    "legalStatus": "convicted",          // convicted | guilty_plea | charged | died_uncharged | unidentified | named_in_reporting
    "living": false,                     // null = not established. A living person with no proceedings MUST be named_in_reporting.
    "caption": "People v. Gacy, 103 Ill. 2d 1 (1984)", "caseNumber": null, "court": "Circuit Court of Cook County",
    "lede": null, "firstKillingYear": 1972, "lastKillingYear": 1978, "caughtYear": 1978, "diedYear": 1994,
    "states": ["IL"], "statesNote": null, "methods": ["strangulation"], "victimology": "Teenage boys and young men",
    "howCaught": "investigation", "howCaughtText": "Missing-person case of Robert Piest", "mobility": null,
    "homeBaseCounty": "Cook", "homeBaseState": "IL",
    "vitals": [{ "k": "Born", "v": "March 17, 1942 · Chicago", "sourceId": "..." }]
  },
  "sources": [
    { "id": "ill-sup-ct-gacy-1984", "kind": "opinion", "title": "People v. Gacy, 103 Ill. 2d 1", "publisher": "Supreme Court of Illinois", "date": "1984-06-06", "url": "https://www.courtlistener.com/...", "archiveUrl": null }
  ],
  "proceedings": [
    { "id": "gacy-1980-trial", "label": "Convicted on 33 counts of murder", "court": "Circuit Court of Cook County", "caseNumber": null, "date": "1980-03-12",
      "outcome": "conviction",           // conviction | guilty_plea | acquittal | vacated | dismissed | charged_pending | died_pending
      "counts": 33, "tier": "convicted_at_trial", "sourceId": "ill-sup-ct-gacy-1984", "pinpoint": "103 Ill. 2d at 23", "note": null }
  ],
  "counts": [                            // optional, victim-level; must reconcile to the proceeding's count
    { "proceedingId": "gacy-1980-trial", "label": "1", "victimName": "...", "ageAtDeath": 15, "lastSeen": "1972-01-03", "found": null, "recoverySite": null,
      "basis": "confession", "dna": false, "paint": false, "ledToRemains": true, "partialRemains": false, "janeDoeLabel": null, "identifiedYear": null,
      "sourceId": "...", "pinpoint": null, "narrative": { "establishes": ["..."] } }
  ],
  "attributions": [ { "totalCount": 33, "tier": "convicted_at_trial", "sourceId": "ill-sup-ct-gacy-1984", "note": null } ],
  "claims": [ { "subject": "offender", "field": "born", "value": "1942-03-17", "tier": "named_in_reporting", "sourceId": "...", "note": null } ],
  "events": [ { "date": "1978-12-21", "lane": "investigation", "text": "...", "sourceId": "..." } ],
  "documents": ["ill-sup-ct-gacy-1984"]  // source ids to list under Court records & sources
}
```

Rules enforced by the importer: tiers 1–2 only with outcome conviction/guilty_plea; a `named_in_reporting` offender cannot have proceedings;
`living: true` with no proceedings forces `named_in_reporting`; no victim home addresses (recoverySite must be a named place, not a street number).
