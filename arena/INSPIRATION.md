# Where the format comes from

Steelman Arena was inspired by the YouTube channel **Clarified Mind** (channel id `UCMWgkXXf2eKb2A3UKoXmFVQ`), in particular its playlist "AI Debate Each Other". This note records what was studied and what the app borrowed, so the lineage is honest and the next person can go further.

## What the channel does

Two AI characters debate a hard question in a scripted, voiced video. The scripts are written entirely by AI; the voices come from a text-to-speech service; five AI models (ChatGPT, Claude, Grok, DeepSeek, Gemini) act as referees. Key videos and what each shows:

| Video | Format point |
|---|---|
| *GOD EXISTS? AI vs AI* | Two AI characters argue each side; the five models each score every response; the thumbnail is the five mascots with check or cross marks, which is the whole format in one image. |
| *Israel vs Palestine* | A published criteria document: eight topic-specific criteria the referees score against, written before the debate. |
| *Is Islam the true religion?* | A weighted rubric: seven criteria weighted 25/20/20/15/10/10, each scored 0 to 4 and scaled to 0 to 10, then penalties of one point for a factually incorrect claim and one for a major logical fallacy. |
| *Free Will* and the socialism debates | Chapter titles for every turn ("Socialist - First-Mover Advantage"), numbered moderator questions, each side critiquing the other's practical program, a "How Judges Evaluate" explainer early in the video, a "Final Score Assessment", and one model's narrative evaluation at the end. |
| *AI Decides on Absurd Trolley Problems* (3.8 million views), *Humans Got Talent* | Five models each give a verdict on every item and a majority board tallies them; the appeal is watching minds agree and split. |
| *Nietzsche vs Jung*, *Buddha and Jung in 2025* | Historical figures debate each other in their own voices, with the twist of asking what they would change having seen the present. |
| *AI Takes Religious Philosophy Quiz* | Minds answering the same hard questions side by side, scored. |

What makes the channel work is not the spectacle of AI; it is that the judging is explained before the arguments start, scored per response on criteria the viewer can see, and summed into a board the viewer can disagree with.

## What the app took

1. **A topic-specific weighted rubric.** The brief now writes four to six criteria for the topic in hand, each with a one-line description of what a 10 looks like and a weight summing to 100, editable in the green room. Every answer and rebuttal is scored out of 100: the six universal criteria (60 points) plus the weighted rubric (40 points), minus one point for each factually incorrect claim and each major logical fallacy a judge names. This is the Islam-debate rubric generalized to any topic.
2. **"How the judges evaluate" up front.** The debate feed opens with a card that lays out the criteria, the rubric with its weights, the penalties, and the bench, before the first word is spoken.
3. **Chapter titles.** The panel names the move each answer and rebuttal made ("Deterrence as reputation", "Two budgets"); the titles sit in each speech card's header and in the exported transcript, the way the channel's chapters sit in the video timeline.
4. **The lineup.** A second format: five minds, no assigned sides, one vote each on every question, with the majority, the dissenters, and whoever stood alone counted on a board, a moderator's call per question, and a closing read of the patterns in how the room split. This is the trolley-problem and quiz format, with personas standing in for the five models.
5. **Minds across time.** A category of matchups between real thinkers (Nietzsche vs. Jung, Keynes vs. Hayek in 2026, Lincoln vs. Douglass in 2026). When a topic names real figures, the candidates are those figures, arguing from their own writings with knowledge of the present, and one question asks each what they would now revise.

## What the app does differently

- The channel uses five different model vendors as referees; the app uses one model and gives it five judges with distinct lenses, strictness, and focus criteria, plus a bias audit (blind, both orders, one call per judge, swapped rematch) to test whether the bench is doing the deciding.
- The channel's scripts are fixed; here every debate is generated live on a topic of your choosing, and the candidates, panel, rubric, and questions are editable before the start.
- The channel keeps score per response; the app keeps score per question (answer plus rebuttal) and calls a question only when the margin clears a threshold, so a close exchange reads as even rather than as a win by a tenth of a point.
