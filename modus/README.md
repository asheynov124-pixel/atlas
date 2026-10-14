# MODUS

Serial murder in America, graded by evidence. A private research app: every fact carries its source and its
evidence tier; totals are computed from court results, never typed in.

- `SPEC.md` — the build spec (reconstructed; see its provenance note) · `PLAN.md` — phases and tests · `DECISIONS.md` — choices made without the owner
- `data/seed/` — verified seed (31 offenders, Ridgway's 49 counts, 54 MAP clusters) · `data/notes/research-notes.md` — caveats
- `data/cases/` — case files written by the research skill · `skills/` — `modus-research`, `modus-verify`

## Run locally
```bash
cp .env.example .env.local            # DATABASE_URL (Postgres 16+), APP_PASSWORD, APP_SECRET
npm install
npm run db:reset                      # drizzle push → views → seed   (push drops the views; reset reapplies them)
npm test                              # the fixed numbers: 49 / 5-4-40 / 19 minors; 299 / 593; 54 clusters
npm run dev                           # http://localhost:3000
```

## Add or update a case
```bash
npm run case:import -- data/cases/<slug>.json     # validates tiers, reconciliation, privacy rules; queues gaps
npm run case:verify -- data/verifications/<slug>.json   # second-pass verdicts → /review
```
