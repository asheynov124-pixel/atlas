# Steelman Arena

Jubilee-style debates between AI personas on politics, war, philosophy, psychology, law, life, and anything you type in. A moderator frames the motion, two sides argue it through openings, rebuttals, cross-examination, and closings, and a bench of AI judges scores both sides on six criteria and names a winner. You can read every speech, have it read aloud, and cast your own vote before and after.

## Two ways to run it

**Inside claude.ai (no setup).** The same page is published as a claude.ai artifact. There it asks Claude through the artifact runtime, on your own Claude account; the first turn asks you to allow it. Nothing to install.

**Locally (your own API key).** The page is served by a small Node server that streams completions from the Anthropic API.

```bash
cd arena
cp .env.example .env        # put your ANTHROPIC_API_KEY in it
npm install
npm start                   # http://localhost:4321
```

Node 22.9 or newer. The server reads `.env` on start; alternatively run `ant auth login` once and leave the key unset.

## What is in the box

| File | What it does |
|---|---|
| `public/arena.html` | The whole app: personas, judges, topic library, prompts, debate engine, scoring, speech, export. Written as an artifact page fragment (title and style first, no `<html>` wrapper). |
| `server.mjs` | Serves the page wrapped in a document skeleton and exposes `POST /api/complete`, a server-sent-events stream of text deltas from Claude. |
| `.env.example` | Settings: model, quick-tier model, port, refusal fallbacks. |

## How a debate runs

1. **Moderator** (quick tier) returns JSON: why the question matters, working definitions, what each side must show, the likely crux. This framing is given to every debater and judge.
2. **Debaters** stream their speeches one at a time. Each prompt carries the persona card, the house rules (no invented evidence, no straw men, spoken prose), the full transcript so far, and the round-specific task. The side that opens first closes last.
3. **Judges** run in parallel, each with a different lens (logic, evidence, rhetoric, intellectual honesty, lay audience). Each returns a ballot as JSON: integer scores 1 to 10 on argumentation, evidence, responsiveness, clarity, persuasion, and honesty for both sides, a winner and margin, the decisive reasoning, best and weakest moments quoted from the transcript, dropped arguments, fallacies, and one line of coaching per side.
4. **Tally**: winner by majority of ballots (average total breaks a tie), with per-criterion averages drawn as a split bar.

Formats: Full (four rounds), Standard (three), Quick (two). Teams of one or two per side. Three or five judges. Speech length short, medium, or long.

## Models

| Tier in the page | Local server | In claude.ai |
|---|---|---|
| Quick | `ARENA_QUICK_MODEL` (default `claude-haiku-5-5`), effort low | the platform's quick tier |
| Balanced | `ARENA_MODEL` (default `claude-opus-5-5`), effort medium for debaters and high for judges | the default tier |
| Deep | `ARENA_MODEL`, effort high | the complex tier |

Server-side refusal fallbacks (`fallbacks: "default"`) are on by default for non-Haiku models; set `ARENA_FALLBACKS=off` to disable.

## Adding your own material

Everything is plain data at the top of the script in `public/arena.html`:

- `PERSONAS`: name, title, bio, speaking style, preferred speech voices.
- `JUDGES`: name, title, and the lens that shapes how they weigh the criteria.
- `TOPICS`: categories and motions. A motion is a declarative claim the Affirmative defends.
- `CRITERIA`: the six ballot criteria and their definitions.

Custom motions typed into the page can be sharpened into a crisp debatable claim with one quick-tier call.
