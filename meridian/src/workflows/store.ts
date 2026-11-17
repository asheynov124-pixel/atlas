/**
 * Workflow store: the firm's own workflows in SQLite, gallery examples in code, community
 * workflows as JSON files in a shared folder (MERIDIAN_COMMUNITY_DIR, e.g. a firm network
 * drive). Publishing writes a JSON file there; importing reads one back.
 */
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Db } from '../store/db.js';
import { json } from '../store/db.js';
import { normalizeDef, validate, newId, type WorkflowDef } from './definition.js';
import { EXAMPLES } from './gallery.js';
import type { ModelProvider } from '../models/provider.js';

export interface StoredWorkflow { id: string; def: WorkflowDef; source: string; created_by: string | null; uses: number; updated_at: string }

export class WorkflowStore {
  constructor(private db: Db, readonly communityDir: string) {}

  list(): StoredWorkflow[] {
    return (this.db.prepare('SELECT * FROM workflows ORDER BY updated_at DESC').all() as Array<Record<string, unknown>>).map((r) => ({ id: String(r['id']), def: { ...json<WorkflowDef>(r['def'] as string, normalizeDef({})), id: String(r['id']) }, source: String(r['source']), created_by: (r['created_by'] as string) ?? null, uses: Number(r['uses']), updated_at: String(r['updated_at']) }));
  }
  get(id: string): StoredWorkflow | null { return this.list().find((w) => w.id === id) ?? null; }

  save(raw: Partial<WorkflowDef>, user: string, source: 'mine' | 'community' = 'mine'): { workflow?: StoredWorkflow; validation: ReturnType<typeof validate> } {
    const def = normalizeDef({ ...raw, source, author: raw.author ?? user });
    const validation = validate(def);
    if (!validation.ok) return { validation };
    const id = raw.id && this.get(raw.id) ? raw.id : newId();
    const now = new Date().toISOString();
    this.db.prepare('INSERT INTO workflows (id, name, def, source, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, def = excluded.def, updated_at = excluded.updated_at')
      .run(id, def.name, JSON.stringify({ ...def, id }), source, user, now, now);
    return { workflow: this.get(id)!, validation };
  }

  remove(id: string): void { this.db.prepare('DELETE FROM workflows WHERE id = ?').run(id); }
  used(id: string): void { this.db.prepare('UPDATE workflows SET uses = uses + 1 WHERE id = ?').run(id); }

  examples(): WorkflowDef[] { return EXAMPLES; }

  async community(): Promise<WorkflowDef[]> {
    let files: string[] = [];
    try { files = (await readdir(this.communityDir)).filter((f) => f.endsWith('.json')); } catch { return []; }
    const out: WorkflowDef[] = [];
    for (const f of files) { try { out.push(normalizeDef({ ...(JSON.parse(await readFile(join(this.communityDir, f), 'utf8')) as WorkflowDef), source: 'community' })); } catch { /* skip malformed files */ } }
    return out;
  }

  async publish(id: string, user: string): Promise<string> {
    const w = this.get(id);
    if (!w) throw new Error('workflow not found');
    await mkdir(this.communityDir, { recursive: true });
    const file = join(this.communityDir, `${w.def.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}.json`);
    await writeFile(file, JSON.stringify({ ...w.def, id: `cm_${w.id.slice(3)}`, author: w.def.author ?? user, source: 'community' }, null, 2));
    return file;
  }
}

/** AI-guided design: plain-English description in, editable definition out, with the reasoning shown. */
export async function designWorkflow(description: string, provider: ModelProvider): Promise<{ def: WorkflowDef; explanation: string[]; warnings: string[] }> {
  const r = await provider.complete({ tier: 'frontier', effort: 'high', json: true, system: '[[task:workflow_design]] You design workflows for a New Jersey litigation team. Return JSON matching {"name","description","category","input":{"kind":"documents"|"question","filter"},"steps":[{"title","kind":"per_document"|"once"|"combine","instructions","model":"fast"|"balanced"|"frontier","effort":"low"|"medium"|"high","tools":[...],"output":"list"|"memo"|"table"|"letter"}],"rubric":[{"text"}],"budget_usd","triggers":[...],"explanation":[...]}. Tools allowed: fs.read, memory.query, research.search, doc.draft, mail.draft, mail.send, calendar.add_deadline. Prefer per_document steps for document work and a final combine step.', prompt: description });
  const parsed = (() => { try { return JSON.parse(/\{[\s\S]*\}/.exec(r.text)?.[0] ?? '{}') as Partial<WorkflowDef> & { explanation?: string[] }; } catch { return {}; } })();
  if (parsed.steps?.length) {
    const def = normalizeDef(parsed);
    return { def, explanation: parsed.explanation ?? ['Designed by the model from your description.'], warnings: validate(def).warnings };
  }
  // Offline designer: reads the description for the same signals a person would.
  const d = description.toLowerCase();
  const explanation: string[] = [];
  const perDoc = /\b(each|every|all)\b.*\b(document|email|file|transcript|contract|report|production|response|letter)s?\b|\bfor each\b/.test(d);
  const research = /\b(case law|authority|authorities|precedent|research|cases?\b|legal standard)\b/.test(d);
  const send = /\b(send|email it|e-mail it|deliver)\b/.test(d);
  const output: WorkflowDef['steps'][number]['output'] = /\bletter|email\b/.test(d) ? 'letter' : /\b(table|chart|log|index|schedule)\b/.test(d) ? 'table' : /\b(memo|brief|analysis|outline)\b/.test(d) ? 'memo' : 'list';
  const filter = /\btranscripts?|depositions?\b/.test(d) ? '*depo*' : /\bexpert\b/.test(d) ? '*expert*' : /\bcontracts?|agreements?\b/.test(d) ? '' : '';
  const words = description.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const name = words.slice(0, 6).map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' ');
  const steps: WorkflowDef['steps'] = [];
  if (perDoc) { steps.push({ id: 's1', title: 'Work through each document', kind: 'per_document', instructions: `${description.trim()} Do this for the document in front of you only, and cite the line for every point.`, model: 'balanced', effort: 'medium', tools: [], output: output === 'letter' ? 'list' : output }); explanation.push('Your description works through documents one at a time, so step 1 runs once per document, in parallel.'); }
  if (research) { steps.push({ id: `s${steps.length + 1}`, title: 'Find the governing authority', kind: steps.length ? 'combine' : 'once', instructions: 'Find the controlling New Jersey authority for the question and quote it verbatim with pin cites.', model: 'frontier', effort: 'high', tools: ['research.search'], output: 'memo' }); explanation.push('You mention case law, so a research step searches the database; every quotation is verified against the opinion.'); }
  steps.push({ id: `s${steps.length + 1}`, title: output === 'letter' ? 'Draft the letter' : output === 'table' ? 'Build the table' : output === 'memo' ? 'Write the memo' : 'Assemble the results', kind: steps.length ? 'combine' : 'once', instructions: steps.length ? `Combine the earlier steps into the final ${output}. ${description.trim()}` : `${description.trim()} Use the matter record and cite every fact.`, model: 'frontier', effort: 'high', tools: [...(steps.length ? [] : ['memory.query']), ...(output === 'letter' ? ['mail.draft'] : []), ...(send ? ['mail.send'] : [])], output });
  explanation.push(`The final step produces a ${output}${send ? ' and sends it, which will stop for a partner’s approval' : ''}.`);
  const def = normalizeDef({ name, description: description.trim(), category: research ? 'research' : /\b(letter|draft|brief|motion)\b/.test(d) ? 'drafting' : 'review', input: { kind: perDoc || !research ? 'documents' : 'question', ...(filter ? { filter } : {}) }, steps, rubric: [{ id: 'c1', text: `The result does what was asked: ${description.trim().slice(0, 120)}` }, { id: 'c2', text: 'Every fact cites the record or a verified authority.' }], budget_usd: perDoc ? 12 : 6, triggers: words.filter((w) => w.length > 5).slice(0, 3).map((w) => w.toLowerCase()) });
  return { def, explanation, warnings: validate(def).warnings };
}

/** Recommend workflows from what is in the matter and what the team uses. */
export function recommendWorkflows(docNames: string[], docTexts: string[], candidates: Array<{ id: string; name: string; source: string; category: string }>, uses: Record<string, number>): Array<{ id: string; name: string; reason: string }> {
  const all = `${docNames.join(' ')} ${docTexts.join(' ').slice(0, 20000)}`.toLowerCase();
  const out: Array<{ id: string; name: string; reason: string; score: number }> = [];
  const add = (match: RegExp, rx: RegExp, reason: string, score: number) => { const c = candidates.find((x) => match.test(x.name) || match.test(x.id)); if (c && rx.test(all)) out.push({ id: c.id, name: c.name, reason, score }); };
  add(/material facts|sumf/i, /statement of (undisputed )?material facts|sumf/, 'This matter has a statement of material facts.', 9);
  add(/simulator/i, /brief|material facts|sumf/, 'Stress-test the statement before you file it.', 8);
  add(/deadline/i, /notice of motion|summons|served|return date|interrogatories/, 'Documents in this matter start court deadlines.', 8);
  add(/depo/i, /deposition|transcript/, 'This matter has deposition transcripts.', 7);
  add(/privilege/i, /attorney|privileged|counsel/, 'Correspondence with counsel suggests a privilege screen.', 5);
  add(/clause/i, /agreement|section \d/, 'The record references contract sections.', 6);
  add(/research memo|case brief/i, /summary judgment|motion|4:46|4:6-2/, 'Motion practice is under way: research the governing standard.', 6);
  add(/demand/i, /breach|non-conforming|defect/, 'The record shows a breach and notice.', 4);
  for (const c of candidates) if ((uses[c.id] ?? 0) >= 2) out.push({ id: c.id, name: c.name, reason: 'Your team uses this often.', score: 3 + (uses[c.id] ?? 0) });
  const seen = new Set<string>();
  return out.sort((a, b) => b.score - a.score).filter((x) => !seen.has(x.id) && seen.add(x.id)).slice(0, 5).map(({ score: _s, ...r }) => r);
}
