/** Starter workflows for the gallery. Each is an ordinary definition a user can copy and edit. */
import type { WorkflowDef } from './definition.js';

const R = (t: string, i = 1) => ({ id: `c${i}`, text: t });

export const EXAMPLES: WorkflowDef[] = [
  { id: 'ex_depo_digest', name: 'Deposition digest', category: 'discovery', description: 'Digest each transcript by topic with page:line cites, then build a cross-witness topic index.', input: { kind: 'documents', filter: '*depo*' }, triggers: ['deposition digest', 'digest the deposition', 'transcript summary'],
    steps: [
      { id: 's1', title: 'Digest each transcript', kind: 'per_document', instructions: 'List each topic the witness testified about, with the substance of the testimony and the page:line pointer for each answer. Note admissions and any "I don’t recall" answers.', model: 'balanced', effort: 'medium', tools: [], output: 'list' },
      { id: 's2', title: 'Topic index across witnesses', kind: 'combine', instructions: 'Group the digests by topic. Under each topic, list what each witness said and flag inconsistencies between witnesses.', model: 'frontier', effort: 'high', tools: [], output: 'table' },
    ], rubric: [R('Every answer summarized carries its page:line cite.'), R('Inconsistencies between witnesses are flagged.', 2)], min_score: 0.85, max_revisions: 2, budget_usd: 15, source: 'example', tags: ['discovery', 'depositions'] },
  { id: 'ex_priv_log', name: 'Privilege log first pass', category: 'discovery', description: 'Flag likely attorney-client and work-product documents and draft log entries for attorney review.', input: { kind: 'documents', filter: '' }, triggers: ['privilege log', 'privileged'],
    steps: [
      { id: 's1', title: 'Screen each document', kind: 'per_document', instructions: 'Decide whether the document may be privileged. If so, give date, author, recipients, a description that does not reveal privileged content, and the basis (attorney-client or work product). Cite the lines that show the author and recipients.', model: 'balanced', effort: 'medium', tools: [], output: 'list' },
      { id: 's2', title: 'Draft the log', kind: 'combine', instructions: 'Assemble a privilege log table of the documents flagged as possibly privileged. Mark every entry for attorney review.', model: 'balanced', effort: 'medium', tools: [], output: 'table' },
    ], rubric: [R('Descriptions do not disclose privileged content.'), R('Every entry is marked for attorney review.', 2)], min_score: 0.85, max_revisions: 2, budget_usd: 12, source: 'example', tags: ['discovery'] },
  { id: 'ex_clause_finder', name: 'Contract clause finder', category: 'review', description: 'Pull notice, cure, limitation-of-liability, dispute-resolution and termination clauses with every deadline they set.', input: { kind: 'documents', filter: '' }, triggers: ['clause', 'contract terms', 'notice provision'],
    steps: [
      { id: 's1', title: 'Find clauses', kind: 'per_document', instructions: 'Find every clause about notice, cure, limitation of liability, dispute resolution, mediation or arbitration, and termination. Quote the operative words and state any deadline the clause sets.', model: 'balanced', effort: 'medium', tools: [], output: 'list' },
      { id: 's2', title: 'Clause chart', kind: 'combine', instructions: 'Chart the clauses by type with their deadlines and what triggers each clock.', model: 'balanced', effort: 'medium', tools: [], output: 'table' },
    ], rubric: [R('Operative language is quoted exactly.'), R('Every deadline names its trigger.', 2)], min_score: 0.85, max_revisions: 2, budget_usd: 8, source: 'example', tags: ['contracts'] },
  { id: 'ex_demand_letter', name: 'Demand letter', category: 'drafting', description: 'Draft a demand letter from the record: facts, breach, damages and a response date.', input: { kind: 'documents', filter: '' }, triggers: ['demand letter'],
    steps: [
      { id: 's1', title: 'Facts for the demand', kind: 'once', instructions: 'From the record, list the facts that establish the agreement, the breach, the notice given and the damages, each with its pointer.', model: 'balanced', effort: 'medium', tools: ['memory.query'], output: 'list' },
      { id: 's2', title: 'Draft the letter', kind: 'combine', instructions: 'Draft a firm, professional demand letter using only those facts. Set a response date fourteen days out. Make no admissions.', model: 'frontier', effort: 'high', tools: ['mail.draft'], output: 'letter' },
    ], rubric: [R('Every factual statement is supported by the record.'), R('No admissions or new commitments.', 2)], min_score: 0.85, max_revisions: 2, budget_usd: 6, source: 'example', tags: ['letters'] },
  { id: 'ex_case_brief', name: 'Case brief', category: 'research', description: 'Brief the leading authority on a question: facts, issue, holding, reasoning, and how it applies here.', input: { kind: 'question' }, triggers: ['brief the case', 'case brief'],
    steps: [
      { id: 's1', title: 'Find and brief the authority', kind: 'once', instructions: 'Identify the controlling authority for the question and brief it: issue, holding and reasoning, using only verified quotations with pin cites.', model: 'frontier', effort: 'high', tools: ['research.search'], output: 'memo' },
      { id: 's2', title: 'Apply it to the record', kind: 'combine', instructions: 'Apply the holding to the facts in this matter’s record, citing the record for each fact.', model: 'frontier', effort: 'high', tools: ['memory.query'], output: 'memo' },
    ], rubric: [R('The holding is stated in the court’s words.'), R('Application cites record facts.', 2)], min_score: 0.85, max_revisions: 2, budget_usd: 10, source: 'example', tags: ['research'] },
  { id: 'ex_motion_outline', name: 'Motion outline', category: 'motion practice', description: 'Point headings with the authority and record cites for each, ready to draft from.', input: { kind: 'question' }, triggers: ['motion outline', 'point headings'],
    steps: [
      { id: 's1', title: 'Governing standard', kind: 'once', instructions: 'State the governing standard for the motion with verified quotations and pin cites.', model: 'frontier', effort: 'high', tools: ['research.search'], output: 'memo' },
      { id: 's2', title: 'Point headings', kind: 'combine', instructions: 'Write persuasive point headings. Under each, list the record facts that support it with pointers, and the authority that supports it.', model: 'frontier', effort: 'high', tools: ['memory.query'], output: 'list' },
    ], rubric: [R('Each point heading is supported by authority and record facts.')], min_score: 0.85, max_revisions: 2, budget_usd: 12, source: 'example', tags: ['motions'] },
  { id: 'ex_client_update', name: 'Client status update', category: 'client', description: 'A plain-English update for the client: where things stand, what is next, what we need from them.', input: { kind: 'documents', filter: '' }, triggers: ['client update', 'status letter'],
    steps: [
      { id: 's1', title: 'Where things stand', kind: 'once', instructions: 'Summarize the current posture of the matter and the next deadlines in plain English, each fact with its pointer.', model: 'balanced', effort: 'medium', tools: ['memory.query'], output: 'list' },
      { id: 's2', title: 'Draft the update', kind: 'combine', instructions: 'Write a short, warm, plain-English update letter to the client. List what we need from them. Avoid legal jargon.', model: 'balanced', effort: 'medium', tools: ['mail.draft'], output: 'letter' },
    ], rubric: [R('Plain English a business client can follow.'), R('Next steps and asks are concrete.', 2)], min_score: 0.8, max_revisions: 2, budget_usd: 5, source: 'example', tags: ['client'] },
  { id: 'ex_discovery_deficiency', name: 'Discovery deficiency letter', category: 'discovery', description: 'Compare discovery responses with the requests, list each deficiency, and draft a meet-and-confer letter.', input: { kind: 'documents', filter: '*response*' }, triggers: ['deficiency letter', 'deficient responses', 'meet and confer'],
    steps: [
      { id: 's1', title: 'Find deficiencies', kind: 'per_document', instructions: 'For each response, identify answers that are incomplete, evasive, or rest on boilerplate objections, and say what is missing. Cite the response line.', model: 'balanced', effort: 'medium', tools: [], output: 'list' },
      { id: 's2', title: 'Meet-and-confer letter', kind: 'combine', instructions: 'Draft a professional letter that lists each deficiency, asks for supplementation by a date certain, and invites a call to resolve the dispute in good faith before motion practice.', model: 'frontier', effort: 'high', tools: ['mail.draft'], output: 'letter' },
    ], rubric: [R('Each deficiency cites the response it concerns.'), R('Tone invites a good-faith resolution.', 2)], min_score: 0.85, max_revisions: 2, budget_usd: 8, source: 'example', tags: ['discovery', 'letters'] },
];
