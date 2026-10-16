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
13. **`drizzle-kit push` drops the views.** Any schema push must be followed by `npm run db:views`; `npm run db:reset`
    does push → views → seed in order. The tests fail loudly if the views are missing.
14. **Auth is a single HMAC cookie.** `proxy.ts` (Next 16's middleware) redirects everything but `/login`, `/api/auth`,
    the manifest, icon, service worker and `/offline`. The cookie stores an HMAC of the password with `APP_SECRET`,
    never the password. With no `APP_PASSWORD` set the app is open (local dev only).
15. **Offline = app shell + last 25 dossiers.** `public/sw.js` caches `/case/*` navigations network-first and trims
    the cache to the 25 most recently refreshed dossiers (their count sub-pages ride along). Index and atlas are not
    cached: they are live data.
16. **Dossier name vs chart name.** `offenders.name` is the full legal name (dossier heading); `short_name` is for
    chart rows and link lists, falling back to `name`.
17. **Research and verification are two skills.** `skills/modus-research` writes a case file and imports it;
    `skills/modus-verify` records verdicts from the cited documents and never edits a fact. The importer refuses
    files that break the tier rules, reconciliation or the privacy rules, so the rules live in one place.
18. **The automated verifier re-derives the review queue** (missing citations, unsourced attributions, source
    conflicts, reconciliation, living-never-charged, street-address recovery sites) and only adds what is missing.
19. **Vercel project `modus`** (prj_B90whJUp0vfy8mQsUYYGkFgmReX6) lives on the personal scope `asheynov124-2433`; Vercel
    Authentication (SSO) is off because the app has its own gate; Node 22. `APP_PASSWORD` and `APP_SECRET` are set as
    encrypted project env vars for production and preview and are not stored anywhere in the repo.
20. **Deploys come from GitHub, not uploads.** The first Git deploy failed with `git_info_fail` because the Vercel
    account has no GitHub login connection; a file upload would push ~200 KB through the agent on every release.
    The owner connects GitHub once (Vercel → Account → Login Connections, then the project's Git settings) and the
    `modus` branch deploys on push with root directory `modus`.
21. **Database is a Neon store created from the Vercel Storage tab.** No marketplace integration can be installed by
    API; the owner approves it once in the dashboard, Vercel injects `DATABASE_URL`, and `db:reset` is run against it
    from the workspace.
22. **The base map is fetched at runtime.** us-atlas is a public, versioned dataset; the atlas loads
    `states-albers-10m.json` from jsDelivr in the browser instead of bundling 107 KB of path data.
