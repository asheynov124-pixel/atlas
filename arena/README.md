# Steelman Arena

Presidential-style debates between two AI candidates on big, tangled topics: geopolitics and war, politics, economics, technology, philosophy, psychology, culture, science, and life. A moderator breaks the topic into the questions underneath it, the candidates answer and rebut each question on the clock, a panel of five topic-specific judges scores every exchange out of 100 on a rubric written for that topic, and a chief judge writes the final summation. A second format, the lineup, puts five minds with no assigned sides on a panel and has each vote on every question. You read every word, can hear it read aloud, and make the final call yourself.

The format borrows from the YouTube channel Clarified Mind ("AI Debate Each Other"); see [INSPIRATION.md](INSPIRATION.md) for what was studied and what was taken.

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
| `INSPIRATION.md` | The Clarified Mind channel study and what this app borrowed from it. |
| `.env.example` | Settings: model, quick-tier model, port, refusal fallbacks. |

## Quick start

The page opens on one screen: a question box with six suggestions from the library, three depth cards, an optional "who argues" pair from the roster, and one button. **Snap** runs one sharp question on the quick model with a three-judge panel, no openings or cross-examination, straight to the scorecard and verdict, about a minute. **Short** runs three questions on the full model with the moderator pressing dodges, three to five minutes. **Full evening** builds the complete brief and opens the green room so everything can be edited first. Enter in the question box starts it; an empty box picks a provocative question at random. "Advanced setup" reveals the full topic library, format toggle, roster, standings, and green room; nothing was removed, and the page remembers which screen you used last.

## How a debate runs

1. **Topic and format.** Pick one of 360-plus questions across 24 categories (geopolitics, parties, religion and God, the big metaphysical questions, matchups where two ideas or thinkers compete, minds across time where Nietzsche meets Jung or Keynes meets Hayek in 2026, sex and love, gender, race and nation, crime, health, money, media, art, history, education, and more), ask for eight new ones in any category at a chosen heat (measured, spirited, provocative), hit "Pick a fight between two ideas", or type your own. The clock runs at about 130 words a minute: 1, 2, or 3 minutes per answer and 30, 60, or 90 seconds per rebuttal.
   Choose the format: **Debate** (two candidates, a panel keeps score) or **Lineup** (five minds, one vote each). The "Third Rail" category holds the questions people actually fight about: abortion, guns, Gaza, the bomb, reparations, borders, euthanasia, hate speech.
   **The roster.** Thirty standing experts, each with a name, a tradition (liberal philosopher, democratic socialist organizer, Burkean conservative, libertarian economist, military realist, Catholic natural-law thinker, effective altruist, Islamic scholar, evolutionary psychologist, accelerationist, degrowth ecologist, abolitionist, feminist theorist, national populist, Stoic, existentialist, Christian apologist, physicist, Buddhist teacher, Jungian analyst, constitutionalist, civil libertarian, behavioral economist, game theorist, historian of empires, communitarian, AI-risk thinker, Epicurean, bioethicist, union pragmatist), a short biography with a blind spot, a speaking style, and signature moves. Pick who takes each podium (or up to five for a lineup), or leave it blank and the moderator casts the two whose traditions clash most revealingly on the topic. `ROSTER` in the page is plain data; add your own.
2. **Green room.** The moderator returns, as JSON, the cast (from the roster, or the user's picks), the two positions written in the voice of each candidate's tradition (for "X vs. Y" topics each candidate champions one side; when the topic names real thinkers, the candidates are those thinkers, arguing in their own voice with knowledge of the present), a provocative opening question and a closing question, background kept for the record, a panel of five judges whose expertise fits the topic, a topic-specific scoring rubric, and twelve sub-questions grouped by theme. Everything is then editable before the first word is spoken:
   - **Candidates:** name, tradition, stance label, position, worldview, speaking style, signature moves, avatar (an emoji or two letters), one of eight colors that recolor the podiums, cards, and scoreboard, temperament (calm to fiery), appetite for risk (conventional to heterodox), and the speech voice, pace, and pitch used for read-aloud. Anyone on the roster, or one of fourteen archetypes (the Firebrand, the Contrarian, the Poet, and so on), can be cast with one click; "Let the moderator recast them" invents two new personalities for the same positions; "Swap podiums" trades sides.
   - **Panel:** each judge's name, expertise, lens, the criteria they weigh most, and a strictness from lenient to merciless; add judges from ten presets or blank, remove them, or have the moderator reseat the whole panel. One to seven judges.
   - **Rubric:** four to six criteria written for this topic (for a war: honesty about casualties, strategic logic, historical grounding, cost accounting), each with a one-line description of what a 10 looks like and a weight; edit, reweight, add, or remove them. Weights are scaled to 100 at scoring.
   - **Lineup** (lineup format only): five minds drawn from the fourteen personas, each with a name, style, avatar, color, temperament, and appetite for risk; apply a persona, edit freely, or shuffle.
   - **Questions:** tick, edit, reorder, delete, add your own, or generate six more at a time, optionally aimed at an angle you type ("domestic politics", "what each side fears").
   - **Rules of the evening:** tone (civil, spirited, no holds barred), the clock, model depth, statements, audio, and bench hardening.
3. **Debate.** A "How the judges evaluate" card opens the feed with the six universal criteria, the topic rubric and its weights, the penalties, and the bench. Then the moderator's opening question: not background but a provocation aimed at the nerve of the topic, which each candidate answers the way their tradition would (the background sits behind a disclosure for the record). For each question: the moderator asks, each candidate answers on the clock (alternating who goes first), then each rebuts. The exchange is scored at once by the panel in one call. Each judge scores each candidate out of 100 in three layers: the six universal criteria, 1 to 10 each (insight, evidence, reasoning, responsiveness, eloquence, nuance; 60 points); the topic rubric, 0 to 10 per criterion, weighted and scaled to 40 points; and penalties of one point for each factually incorrect claim and each major logical fallacy the judge names. The panel call also returns a chapter title for every answer and rebuttal (the move it made, shown in the card header and the transcript), a note per judge in their own voice, the best idea on each side, and what the exchange left open. A question is won by a margin of at least 2.5 points, otherwise it is even. Closing statements answer the moderator's closing question: what the audience should walk out believing, and what it would cost them to be wrong.
4. **Final.** The chief judge ranks the questions by how decisively they were won, pulls out the five ideas worth keeping on each side, and lists the open cruxes you now have to decide, with what would settle each. The scoreboard calls a winner only when the average margin is at least 3 points per question or the questions-won gap is at least 2; otherwise it is too close to call.

Calls per question: five, plus a short moderator check and any follow-ups. The two answers run at the same time (each candidate answers without hearing the other, as at a real podium), so do the two rebuttals, the follow-ups, the cross-examination questions and answers, and the opening and closing statements; the panel scores each question in the background while the next one is being argued. A four-question debate with statements and cross-examination takes about 10 beats of wall-clock time rather than 30. Defaults are 1:30 per answer, 0:45 per rebuttal, and four questions; the brief and the panel run at medium effort unless you pick the deep tier, and the moderator's dodge check runs on the quick model.

**Following along.** Every answer and rebuttal opens with one bold sentence that states the position outright. The stage opens in digest reading: each card shows that bottom line with a "read in full" link, and a button at the top switches to everything. When the panel returns, the scorecard leads with "what just happened": each candidate's answer in one neutral sentence, where they actually split, what was conceded, the line to remember, and a claims table listing the factual claims that carried the exchange with the bench's status for each (holds up, contested, wrong). The scoreboard keeps "the story so far": one line per question with who took it. The summation adds "how to decide" (three honest forks: if you believe X, then A) and "where they agreed" above the open cruxes.

**You, in the room.** Before the first word the stage asks where you stand, on a slider between the two positions. Under every scorecard is your own call (either candidate or even, with an optional line on why), shown next to the panel's; the scoreboard counts how often you and the bench agree. The summation asks again where you stand and reports the only score that is really yours: how far the debate moved you, toward whom, and on which questions you broke with the panel. Your ballot goes into the transcript.

**The moderator.** The brief names a moderator with a style. After both answers to a question, the moderator judges whether each candidate answered the question actually asked; a dodge draws a pointed follow-up on air and a thirty-second direct reply, which the panel then scores as part of the exchange. When a judge flags an incorrect claim or a fallacy, the scorecard carries a fact-check ribbon in the moderator's voice. Before closings, a cross-examination round lets each candidate put one question to the other, who must answer it as asked. Both are toggles in the rules of the evening.

**Records.** Every finished night is kept in the browser: who debated, the result, and how far it moved you. The setup screen shows standings for the roster (debates, wins, losses, average score, and who moves you most), the recent nights, and, when you pick two who have met before, their head-to-head. Roster cards carry their record.

**Faces and pace.** Each candidate and mind can carry a portrait (upload a file under 1.5 MB or paste an image URL); portraits for roster members are remembered on the device. The clock on every card counts down in real time while the candidate speaks, and the stage pauses for a beat between answers, follow-ups, rebuttals, and scoring.

**The lineup.** Five minds, no assigned sides. For each question, each mind in turn gives a call (Yes, No, or a specific pick), about 110 words of reasoning with one concrete specific, and a line to remember; later minds see who has already voted and may side with the room or break from it. The moderator then counts the room (majority, sharpest disagreement, most interesting idea) and the board tracks each mind's votes, how often it voted with the majority, and how often it stood alone. A chief moderator closes with the patterns in how the minds split, the ideas worth keeping, and the open cruxes. Six calls per question.

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

It writes `audit-out/audit-report.md` and `audit-out/audit-results.json`. The report covers the noise floor, order effects (labeled and blind, plus the average edge for whoever speaks first), label effects, the length correlation, a halo check across the six criteria, blind win rates by position family, each judge's tilt and agreement with the panel, panel independence (one call versus one call per judge, with `--per-judge`), and, with `--flaws`, whether a fabricated statistic planted in each candidate's answer is punished evenly. Cost is about 4 speech calls plus 4 to 11 scorings per exchange; `--quick` runs everything on the quick model for a cheap smoke test. The batch audit scores on the six universal criteria only (60 points), without the topic rubric or penalties, so its margins are on a different scale from the page's; the biases it measures are the same.

## Models

| Depth in the page | Local server | In claude.ai |
|---|---|---|
| Quick | `ARENA_QUICK_MODEL` (default `claude-haiku-5-5`), effort low | the platform's quick tier |
| Balanced | `ARENA_MODEL` (default `claude-opus-5-5`), effort medium for candidates and high for the panel and brief | the default tier |
| Deep | `ARENA_MODEL`, effort high | the complex tier |

Server-side refusal fallbacks (`fallbacks: "default"`) are on by default for non-Haiku models; set `ARENA_FALLBACKS=off` to disable.

## Adding your own material

`ROSTER`, `TOPICS`, `CANDIDATE_PRESETS`, `JUDGE_PRESETS`, `PALETTE`, `TONES`, `CRITERIA`, `FALLBACK_RUBRIC`, and `DEFAULT_MINDS` are plain data at the top of the script in `public/arena.html`. Candidates, panels, and questions are generated per topic by the brief prompt and then edited in the green room; edit `briefPrompt()` to change how they are built.
