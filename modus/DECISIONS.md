# DECISIONS

Logged choices the owner did not have to make. Newest last.

1. **Branch and folder.** Built on branch `modus`, in `modus/`, following the sibling-project convention in
   this repo (`alder/`, `arena/`, `cosmopolis/` each on their own branch). `main` keeps the Atlas Expo shell.
2. **Spec reconstructed.** `modus-seed-v1.zip` (SPEC.md, research notes, seed CSVs) is not in the repo, Drive
   or any branch. SPEC.md was rebuilt from the kickoff chat and the four approved artboards; the artboards'
   embedded arrays are the seed. Nothing was added or corrected during extraction (`scripts/` keeps the
   generator so this is reproducible).
3. **Tier vocabulary.** Ten tiers, ids in SPEC.md §2.1. Chosen so that tiers 1–2 are the only court results
   and tier 5 covers posthumous DNA clearances (Wilmer) without pretending they are convictions.
4. **Proven totals come from `proceedings`, not from victim rows.** The 30 non-Ridgway offenders were verified
   at the proceeding level (e.g. "33 counts, Cook County, 1980"). Victim-level `counts` rows exist where the
   record is in hand (Ridgway) and must reconcile to the proceeding. This keeps "computed, never typed" honest
   without inventing 250 victim rows.
5. **Citations for the 30 other offenders are owed.** Their figures were verified in the research chat but the
   citations did not survive into this repo. Each is imported with `source_id = null` and a review-queue item.
   This is the weakest part of the data (reported at the end of each phase).
6. **No PostGIS locally.** Postgres 16 here lacks PostGIS. Clusters are keyed by county + state and joined to
   `us-atlas` county geometry on the client, so no lat/lng is stored that we did not source. Neon can turn
   PostGIS on later without a schema change.
7. **Recovery-site positions.** The Ridgway map keeps the artboard's schematic percent coordinates
   (approximate to the named site, as the design says). No geocoding was done; a geocoded point would imply a
   precision the record does not have.
8. **Offender home bases.** Not seeded. The artboard's diamonds were design positions, not sourced locations.
   The Atlas layer renders whatever `home_base_*` the research skill later fills with a source.
9. **Links are computed.** Connection groups on a dossier are derived from shared method, victimology, state,
   how-caught category and MAP cluster overlap. Nothing hand-written per case.
10. **Vercel scope.** The account has no teams, so deployment goes to the personal scope unless told otherwise.
11. **Local dev DB.** `postgres://modus:modus@localhost:5432/modus` (role created in this container only).
12. **Design CSS, not Tailwind.** The artboards define a complete token set and type system (Archivo,
    Newsreader, JetBrains Mono); the app ports that CSS directly.
