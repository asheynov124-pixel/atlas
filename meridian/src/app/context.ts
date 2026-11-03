/** What a workflow template can reach inside one matter. */
import type { Kernel } from '../kernel/bootstrap.js';
import type { Planner, SpecialistExecutor } from '../kernel/run.js';
import type { OutcomeRubric, ActionTier, SpanPointer } from '../core/types.js';
import type { DocumentIndex } from '../ingest/documents.js';
import type { ResearchLibrary } from '../research/library.js';
import type { ResearchAgent } from '../research/agent.js';

export interface WorkflowTemplate {
  planner: Planner;
  executor: SpecialistExecutor;
  rubric: OutcomeRubric;
  description: string;
  /** Picks this template for a free-text goal. Higher wins. */
  match: (goal: string) => number;
  default_budget_usd?: number;
  risk_tier_ceiling?: ActionTier;
  label?: string;
  category?: string;
  builtin?: boolean;
}

export interface TemplateContext {
  kernel: Kernel;
  docs: DocumentIndex;
  lib: ResearchLibrary;
  agent: ResearchAgent;
  matter: { id: string; name: string };
  /** Copy an opinion into this matter's L2 (once) so quotes from it carry resolvable pointers. */
  lawPointer: (case_id: string) => SpanPointer | null;
  /** Arm tripwires on paragraphs a brief relies on. */
  armTripwires?: (doc_id: string, paragraphs: Array<{ n: number; text: string }>) => void;
}

/** Numbered paragraphs ("1.", "¶ 1", "1)") with their character spans in the document text. */
export function numberedParagraphs(text: string): Array<{ n: number; text: string; start: number; end: number }> {
  const out: Array<{ n: number; text: string; start: number; end: number }> = [];
  const rx = /^[ \t]*(?:¶\s*)?(\d{1,3})[.)]\s+(.+(?:\n(?![ \t]*(?:¶\s*)?\d{1,3}[.)]\s)(?!\s*$).+)*)/gm;
  for (const m of text.matchAll(rx)) {
    const body = m[2]!;
    const start = m.index! + m[0].indexOf(body);
    out.push({ n: Number(m[1]), text: body.replace(/\s+/g, ' ').trim(), start, end: start + body.length });
  }
  return out;
}

const STOPWORDS = new Set(['the', 'and', 'that', 'with', 'from', 'this', 'were', 'was', 'for', 'which', 'under', 'have', 'has', 'not', 'its', 'their', 'been', 'into', 'upon', 'any', 'all', 'said', 'such', 'also', 'within', 'after', 'before', 'than', 'there']);

/** Facts a sentence depends on: dates, times, numbers, proper names and content words. */
export function keyFacts(s: string): { dates: string[]; times: string[]; numbers: string[]; names: string[]; words: string[] } {
  const dates = [...s.matchAll(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2}\b|\b20\d{2}-\d{2}-\d{2}\b|\b\d{2}\/\d{2}\/20\d{2}\b/g)].map((m) => normDate(m[0]));
  const times = [...s.matchAll(/\b\d{1,2}:\d{2}\b/g)].map((m) => m[0].padStart(5, '0'));
  const stripped = s.replace(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2}\b/g, ' ').replace(/\b\d{1,2}:\d{2}\b/g, ' ');
  const numbers = [...stripped.matchAll(/\b\d+(?:\.\d+)?%?\b/g)].map((m) => m[0]).filter((n) => !/^(19|20)\d{2}$/.test(n));
  const names = [...s.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g)].map((m) => m[1]!).filter((n) => !/^(The|This|On|In|At|By|For|Harbor's|A|An|It|Its|Section|Rule|Plaintiff|Defendant|January|February|March|April|May|June|July|August|September|October|November|December|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/.test(n));
  const words = [...new Set(s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3 && !STOPWORDS.has(w)))];
  return { dates: [...new Set(dates)], times: [...new Set(times)], numbers: [...new Set(numbers)], names: [...new Set(names)], words };
}

export function normDate(s: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const mdY = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (mdY) return `${mdY[3]}-${mdY[1]}-${mdY[2]}`;
  const d = new Date(`${s} UTC`);
  return isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
}

/** Our own drafts, briefs and statements: assertions, not record evidence. */
export function isWorkProduct(name: string): boolean {
  return /draft|sumf|\bbrief\b|statement of (undisputed )?material facts/i.test(name);
}

/** All sentences of every matter document, with pointers, for retrieval and contradiction search. */
export function recordSentences(docs: DocumentIndex, exclude?: string): Array<{ doc_id: string; text: string; start: number; end: number; pointer: SpanPointer; cite: string }> {
  const out: Array<{ doc_id: string; text: string; start: number; end: number; pointer: SpanPointer; cite: string }> = [];
  for (const d of docs.list()) {
    if (d.id === exclude) continue;
    const text = docs.text(d.id);
    for (const line of d.lines) {
      if (line.pending) continue;
      const seg = text.slice(line.start, line.end);
      let offset = 0;
      for (const part of seg.split(/(?<=[.!?])\s+(?=[A-Z])/)) {
        const s = line.start + seg.indexOf(part, offset);
        offset = s - line.start + part.length;
        if (part.trim().length < 12) continue;
        const pointer = `ep:docs/${d.id}/chars_${s}-${s + part.length}` as SpanPointer;
        out.push({ doc_id: d.id, text: part.trim().replace(/^[-*]\s+/, ''), start: s, end: s + part.length, pointer, cite: docs.citeFor(pointer) ?? d.name });
      }
    }
  }
  return out;
}
