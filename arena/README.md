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
| `.env.example` | Settings: model, quick-tier model, port, refusal fallbacks. |

## How a debate runs

1. **Topic.** Pick one from the library, generate new ones for a category, or type your own. Set the clock: time per answer (1, 2, or 3 minutes at about 130 words a minute) and rebuttal time (30, 60, or 90 seconds).
2. **Brief.** The moderator returns, as JSON, a neutral background, the two most serious positions (each candidate gets a name, a stance, and a worldview), a panel of five judges whose expertise fits the topic, and ten sub-questions grouped by theme. You tick the ones to debate, generate six more at a time, or add your own.
3. **Debate.** Optional opening statements. For each question: the moderator asks, each candidate answers on the clock (alternating who goes first), then each rebuts. The exchange is scored at once by the panel in one call: integer scores 1 to 10 for both candidates on insight, evidence, reasoning, responsiveness, eloquence, and nuance, a note per judge in their own voice, the best idea on each side, and what the exchange left open. A question is won by a margin of at least 1.5 panel points, otherwise it is even. Optional closing statements.
4. **Final.** The chief judge ranks the questions by how decisively they were won, pulls out the five ideas worth keeping on each side, and lists the open cruxes you now have to decide, with what would settle each. The scoreboard calls a winner only when the average margin is at least 2 points per question or the questions-won gap is at least 2; otherwise it is too close to call.

Calls per question: five. A six-question debate with statements is about 35 turns.

## Models

| Depth in the page | Local server | In claude.ai |
|---|---|---|
| Quick | `ARENA_QUICK_MODEL` (default `claude-haiku-5-5`), effort low | the platform's quick tier |
| Balanced | `ARENA_MODEL` (default `claude-opus-5-5`), effort medium for candidates and high for the panel and brief | the default tier |
| Deep | `ARENA_MODEL`, effort high | the complex tier |

Server-side refusal fallbacks (`fallbacks: "default"`) are on by default for non-Haiku models; set `ARENA_FALLBACKS=off` to disable.

## Adding your own material

`TOPICS` and `CRITERIA` are plain data at the top of the script in `public/arena.html`. Candidates, panels, and questions are generated per topic by the brief prompt, so there is nothing to maintain there; edit `briefPrompt()` to change how they are built.
