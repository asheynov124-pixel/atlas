# Meridian

A litigation workspace for a New Jersey firm, built on the kernel described in
`docs/SPEC.md` (the Meridian Product Architecture Specification, v1.1). Every fact carries
a pin cite to the record, every quotation of law is checked word for word against the
opinion, and nothing leaves the building without a partner's approval.

## Run it

```
npm install
npm start
```

Open http://localhost:8787. The first visit creates the admin account and a fictional
sample matter (Harbor Logistics v. Cinder Freight) so every feature has something to work
on. Stop with Control + C. Everything is saved in `.meridian-data/` and comes back on the
next start.

| Variable | Default | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | unset: mock fleet | Live Claude fleet (Opus 5.5 frontier, Sonnet 5.5 balanced, Haiku 5.5 fast) and OCR of scanned pages. An `ant auth login` profile also works. |
| `COURTLISTENER_TOKEN` | unset | Search every published opinion on CourtListener and import full texts with star pagination. Free account at courtlistener.com. |
| `MERIDIAN_DATA` | `./.meridian-data` | Database (SQLite), matter folders, outbox, calendars. |
| `MERIDIAN_WORKSPACE` | unset | Use an existing folder as the sample matter's documents. |
| `MERIDIAN_COMMUNITY_DIR` | `./community` | Shared folder for community workflows, such as a firm network drive. |
| `MERIDIAN_HOST`, `PORT` | `127.0.0.1`, `8787` | Set `MERIDIAN_HOST=0.0.0.0` to share on the firm network. |
| `MERIDIAN_WATCH` | on | Docket watch on matter folders. `off` disables it. |

Without an API key no AI runs: deterministic rules stand in for the models so the whole
system can be explored for free. Live mode sends document text to Anthropic's API; check
that against firm policy and RPC 1.6 before using client files.

## What is in it

**Firm and matters.** Accounts with roles (admin, partner, associate, paralegal), scrypt
passwords, HttpOnly SameSite=Strict sessions. Each matter is a sealed kernel: its own
memory, ledger, approvals and audit, with no retrieval across matters. Ethical screens
remove a person from a matter, block re-adding them, and record every blocked attempt.
Only partners and admins approve Tier 3 actions; partners can delegate that authority
with a scope and an expiry. The reviewer on every approval comes from the session, never
from the request.

**Permanence and audit.** Every state change is snapshotted to SQLite. After a restart,
interrupted work comes back flagged so it can be resumed. The audit log is append-only
and hash-chained with SHA-256; editing or deleting any row breaks the chain, and
verification says where. Every approval records exactly what the approver saw. Export per
matter or firm-wide as CSV or JSONL.

**Documents.** PDFs (text layer, page and line index, Bates stamp per page), scans (Claude
OCR in live mode, marked "(OCR)" in every cite), email, text, Markdown, HTML. Upload by
drag and drop, or save files into the matter folder. Every pointer converts to a record
cite: `HARBOR_000402, p. 2, ll. 2–7`, or `02-cinder-correspondence.eml, l. 8`.

**Research database.** Cases with full text and star pagination, BM25 full-text search,
a citation graph, and a quote bank that accepts a quote only if it is verbatim in the
opinion and computes its pin cite (`Brill, 142 N.J. at 540`), with "quoting" parentheticals.
The agentic search shows its work: it expands the question into doctrinal phrasings,
searches the library and CourtListener, fuses the rankings, weights binding authority and
your quote bank, reads the best passage of each opinion, and recommends next steps (the
authority a case relies on, passages worth saving, a treatment check, adverse authority).
The research assistant answers only from verified passages and removes any quotation that
is not verbatim. Seeded with verbatim excerpts of *Brill*, *Judson* and *Printing Mart*.

**Drafting.** An editor that takes authorities by drag and drop: quotes from the bank,
record cites from the matter, search results. Each becomes a live cite token. Verify
re-checks every token and every typed quotation followed by a citation, reports wrong pins
with the correct one, builds a table of authorities, and exports to Word.

**Deadlines.** A New Jersey Court Rules table (R. 4:6-1, 4:17-4, 4:18-1, 4:22-1, 2:4-1,
4:49-2, 4:46-1, 1:6-3) with R. 1:3-1 computation, the court holiday table, and R. 1:3-3
mail time. Triggers are found in documents with the sentence that proves them; contract
clocks are cross-checked against dates stated in the file. Each deadline shows its math
and waits for a partner's approval before it goes on the matter calendar (`.ics`). Docket
watch ingests and scans new files saved into the matter folder. A second set of eyes, not
the calendar of record.

**Workflows.** Built in: document review and chronology; reply to opposing counsel
(Tier 3 send); Statement of Material Facts cite-check under R. 4:46-2(a); opposing-counsel
simulator (opposing counsel, a skeptical judge and a cite-checker, a vulnerability map,
and tripwires that fire when a new document contradicts a relied-on paragraph); verified
research memo (quotes verified, adverse authority under RPC 3.3(a)(3), heuristic treatment
scan). The workflow creator builds your own: by hand, by describing it to Meridian, or by
starting from the gallery or the community folder. A user workflow can reach only the
tools it declares, and its sends and calendar entries still stop for approval.

## Tests and demos

```
npm test                  # units, kernel, and end-to-end firm flows over HTTP
npm run demo:diligence    # spec §9.3 swarm demo
npm run demo:initiative   # spec §9.4 proactive approval demo
npm run make:sample-pdf   # rebuilds the fictional Bates-stamped production
```

## Honest limits

- `mail.send` writes the approved message to the matter's `outbox/` as an `.eml` file. It
  does not deliver mail.
- The treatment scan reads citing opinions for negative language. It is not KeyCite or
  Shepard's.
- The seed opinions are excerpts. Import full texts before relying on context.
- Deadlines are computed from the Rules as encoded here; confirm against the current
  Rules, any order, and the Judiciary's holiday schedule.
- Mock mode does no OCR; scanned pages are flagged until live models read them.
- Word `.docx` uploads are not read yet; save as PDF.
