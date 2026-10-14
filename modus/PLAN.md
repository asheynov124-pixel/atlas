# PLAN — MODUS build

Status key: ☐ todo · ◐ in progress · ☑ done

## Phase 0 — Foundation ◐
- ☑ Locate inputs. Seed zip missing; design canvas found; data recovered from artboards.
- ☑ Branch `modus`, folder `modus/`, Next.js 15 + TypeScript scaffold, Drizzle, Postgres 16 local.
- ☑ `data/seed/*.json` generated verbatim from the artboards (`scripts/gen-seed.mjs`).
- ☑ SPEC.md (reconstructed), DECISIONS.md, this plan, `data/notes/research-notes.md`.
- **Verify:** seed JSON gives 49 counts split 5 / 4 / 40, 19 minors; 299 proven / 593 attributed over 31; 54 clusters. ☑ (checked at generation)

## Phase 1 — Schema and import
- Tables: sources, offenders, proceedings, counts, attributions, claims, events, documents, map_clusters,
  map_stats, review_queue. Views: offender_totals, source_conflicts.
- `npm run db:push && npm run db:seed` imports everything; review items created for missing citations.
- **Verify (vitest against the DB):** Ridgway view returns proven 49; basis 5/4/40; 19 minors, 5 aged ≤15;
  index totals 299/593; 54 clusters; every proceeding with count rows reconciles; Lovvorn age conflict surfaces.

## Phase 2 — Pages
- Port the artboard CSS and components. `/case/[slug]`, `/index`, `/atlas`, `/unidentified`, `/records`.
- Phone layout per the Mobile artboard.
- **Verify:** pages render the Phase 1 numbers from the DB (no literals); screenshot diff against the PNGs at
  1440 and 390 wide.

## Phase 3 — Links, search, offline, password
- Computed connection groups; full-text search (pg_trgm + unaccent); service worker caching the last 25 opened
  dossiers; app-password middleware.
- **Verify:** every dossier has ≥1 link group; a searched name resolves; 25 dossiers open offline in Chromium;
  unauthenticated request is redirected.

## Phase 4 — Research skill, verifier, review queue
- `skills/modus-research/SKILL.md` + import CLI; `skills/modus-verify/` second-pass check against court docs;
  `/review` page.
- **Verify:** import one new case end to end; a deliberately wrong count is caught by the verifier and queued.

## Phase 5 — Deploy and full MAP file
- Vercel (personal scope unless told), Neon, env vars, domain. MAP 1976–2025 import (owner downloads the file).
- **Verify:** preview URL; atlas re-derives the 54 clusters from the raw 1980–2014 file; new file loads.

## Needs the owner (only these)
1. Vercel: personal scope is fine? (no teams on the account)
2. The app password.
3. A domain, if any.
4. The MAP 1976–2025 file, if the download site stays blocked.
5. Any borderline image.
