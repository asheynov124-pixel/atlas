# Steelman Arena

Presidential-style debates between two AI candidates on big, tangled topics: geopolitics and war, politics, economics, technology, philosophy, psychology, culture, science, and life. A moderator breaks the topic into the questions underneath it, the candidates answer and rebut each question on the clock, a panel of five topic-specific judges scores every exchange, and a chief judge writes the final summation. You read every word, can hear it read aloud, and make the final call yourself.

## Two ways to run it

**Inside claude.ai (no setup).** The same page is published as a claude.ai artifact. There it asks Claude through the artifact runtime, on your own Claude account; the first call asks you to allow it. Nothing to install.

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
| `public/arena.html` | The whole app: topic library, prompts, the brief builder, the debate engine, scoring, speech, export. Written as an artifact page fragment (title and style first, no `<html>` wrapper). |
| `server.mjs` | Serves the page wrapped in a document skeleton and exposes `POST /api/complete`, a server-sent-events stream of text deltas from Claude. |
| `audit.mjs` | Batch bias audit of the bench; see Auditing the bench. |
| `.env.example` | Settings: model, quick-tier model, port, refusal fallbacks. |

## How a debate runs

1. **Topic.** Pick one of 340-plus questions across 23 categories (geopolitics, parties, religion and God, the big metaphysical questions, matchups where two ideas or thinkers compete, sex and love, gender, race and nation, crime, health, money, media, art, history, education, and more), ask for eight new ones in any category at a chosen heat (measured, spirited, provocative), hit "Pick a fight between two ideas", or type your own. The clock runs at about 130 words a minute: 1, 2, or 3 minutes per answer and 30, 60, or 90 seconds per rebuttal.
2. **Green room.** The moderator returns, as JSON, a neutral background, the two most serious positions (for "X vs. Y" topics each candidate champions one side), a panel of five judges whose expertise fits the topic, and twelve sub-questions grouped by theme. Everything is then editable before the first word is spoken:
   - **Candidates:** name, stance label, position, worldview, speaking style, avatar (an emoji or two letters), one of eight colors that recolor the podiums, cards, and scoreboard, temperament (calm to fiery), appetite for risk (conventional to heterodox), and the speech voice, pace, and pitch used for read-aloud. Fourteen personas (the Firebrand, the Stoic, the Contrarian, the Poet, and so on) can be applied with one click; "Let the moderator recast them" invents two new personalities for the same positions; "Swap podiums" trades sides.
   - **Panel:** each judge's name, expertise, lens, the criteria they weigh most, and a strictness from lenient to merciless; add judges from ten presets or blank, remove them, or have the moderator reseat the whole panel. One to seven judges.
   - **Questions:** tick, edit, reorder, delete, add your own, or generate six more at a time, optionally aimed at an angle you type ("domestic politics", "what each side fears").
   - **Rules of the evening:** tone (civil, spirited, no holds barred), the clock, model depth, statements, audio, and bench hardening.
3. **Debate.** Optional opening statements. For each question: the moderator asks, each candidate answers on the clock (alternating who goes first), then each rebuts. The exchange is scored at once by the panel in one call: integer scores 1 to 10 for both candidates on insight, evidence, reasoning, responsiveness, eloquence, and nuance, a note per judge in their own voice, the best idea on each side, and what the exchange left open. A question is won by a margin of at least 1.5 panel points, otherwise it is even. Optional closing statements.
4. **Final.** The chief judge ranks the questions by how decisively they were won, pulls out the five ideas worth keeping on each side, and lists the open cruxes you now have to decide, with what would settle each. The scoreboard calls a winner only when the average margin is at least 2 points per question or the questions-won gap is at least 2; otherwise it is too close to call.

Calls per question: five. A six-question debate with statements is about 35 turns.

## Hardening the bench

Three structural fixes sit behind checkboxes on the setup screen, all off by default so the plain bench can be compared with the hardened one:

- **Blind judging.** The panel sees "Speaker One" and "Speaker Two", the topic and background, and the words. Names, stance labels, and the brief's positions are withheld; candidate names inside the speeches are scrubbed.
- **Score both orders and average.** Every exchange is scored twice, once with each candidate presented first, and the two ballots are averaged per judge. Position bias cancels out.
- **One call per judge.** Each judge scores in a separate call instead of five ballots coming out of one call. Costs five calls per scoring instead of one.

The estimate on the brief screen updates with the choices.

## Auditing the bench

**In the page.** After any debate, "Audit the bench" re-scores every question three more ways: the same prompt again (the noise floor), blind, and blind with the order swapped. Each scorecard gets an audit box and the final card gets a summary: how far the margin moved under each test, whether the winner flipped, the hardened call (blind, both orders averaged) next to the original, and a verdict per question of solid, shaky, or even. "Rematch, positions swapped" reruns the same questions with the candidates' positions traded between podiums and reports whether the same position won from either podium or the win travelled with the podium. Three calls per question for the audit; a full rerun for the rematch.

**In batch.** `audit.mjs` runs short debates on several topics straight against the API and re-scores every exchange several ways:

```bash
npm run audit -- --topics 6 --questions 3 --repeats 2 --per-judge --flaws
npm run audit -- --topic "Is ambition a trap?" --topic "Should billionaires exist?" --quick
```

It writes `audit-out/audit-report.md` and `audit-out/audit-results.json`. The report covers the noise floor, order effects (labeled and blind, plus the average edge for whoever speaks first), label effects, the length correlation, a halo check across the six criteria, blind win rates by position family, each judge's tilt and agreement with the panel, panel independence (one call versus one call per judge, with `--per-judge`), and, with `--flaws`, whether a fabricated statistic planted in each candidate's answer is punished evenly. Cost is about 4 speech calls plus 4 to 11 scorings per exchange; `--quick` runs everything on the quick model for a cheap smoke test.

## Models

| Depth in the page | Local server | In claude.ai |
|---|---|---|
| Quick | `ARENA_QUICK_MODEL` (default `claude-haiku-5-5`), effort low | the platform's quick tier |
| Balanced | `ARENA_MODEL` (default `claude-opus-5-5`), effort medium for candidates and high for the panel and brief | the default tier |
| Deep | `ARENA_MODEL`, effort high | the complex tier |

Server-side refusal fallbacks (`fallbacks: "default"`) are on by default for non-Haiku models; set `ARENA_FALLBACKS=off` to disable.

## Adding your own material

`TOPICS`, `CANDIDATE_PRESETS`, `JUDGE_PRESETS`, `PALETTE`, `TONES`, and `CRITERIA` are plain data at the top of the script in `public/arena.html`. Candidates, panels, and questions are generated per topic by the brief prompt and then edited in the green room; edit `briefPrompt()` to change how they are built.
