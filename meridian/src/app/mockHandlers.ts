/**
 * Deterministic handlers so the whole app runs with no API key. Each handler is
 * keyed by the [[task:…]] tag the kernel puts in the system prompt.
 */
import { MockProvider } from '../models/mock.js';
import { splitUnits } from '../core/text.js';

const DATE = /\b(20\d{2}-\d{2}-\d{2}|(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, 20\d{2})\b/g;

export function toIsoDate(s: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
}


/** Sentences from MEMORY spans that best match the query terms, each with a pointer narrowed to the sentence. */
function pickSentences(prompt: string, queryText: string, limit: number): Array<{ sentence: string; pointer: string }> {
  const terms = queryText.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3 && !['what', 'when', 'which', 'where', 'does', 'have', 'with', 'that', 'this', 'about', 'between', 'parties', 'send', 'reply', 'email'].includes(t));
  const spans = [...prompt.matchAll(/\[\[(ep:[^\]\[]+)\]\]\s*([\s\S]*?)(?=\n\[\[ep:|$)/g)];
  const scored: Array<{ score: number; sentence: string; pointer: string }> = [];
  for (const m of spans) {
    const ptr = m[1]!; const body = m[2]!;
    for (const sentence of body.split(/(?<=[.!?])\s+(?=[A-Z⟦\[(“"-])|\n+/)) {
      const sl = sentence.toLowerCase();
      if (/^(from|to|date|subject):/i.test(sentence.trim()) || sentence.trim().startsWith('#')) continue;
      const score = terms.reduce((n, t) => n + (sl.includes(t) ? 1 : 0), 0);
      if (score === 0) continue;
      const start = body.indexOf(sentence);
      const base = /chars_(\d+)-/.exec(ptr)?.[1] ?? '0';
      scored.push({ score, sentence: sentence.trim().replace(/^[-*+]\s+/, ''), pointer: ptr.replace(/chars_\d+-\d+$/, `chars_${Number(base) + start}-${Number(base) + start + sentence.length}`) });
    }
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Generic step for user-built workflows: picks the input sentences that best match the
 * step's instructions and keeps their pointers, so evidence checks pass on real text.
 */
function customStep(prompt: string, system: string): string {
  const instr = (/INSTRUCTIONS:\s*([\s\S]*?)\n\n/.exec(prompt)?.[1] ?? system).toLowerCase();
  const terms = instr.split(/[^a-z0-9]+/).filter((t) => t.length > 3 && !['each', 'every', 'document', 'from', 'with', 'that', 'this', 'list', 'extract', 'write', 'summarize', 'into', 'cite', 'pointer', 'sentence'].includes(t));
  const blocks = [...prompt.matchAll(/\[\[(ep:[^\]\[]+)\]\]\n?([\s\S]*?)(?=\n\[\[ep:|\n\nEND INPUT|$)/g)];
  const lines: string[] = [];
  for (const b of blocks) {
    const ptr = b[1]!; const body = b[2]!; const base = Number(/chars_(\d+)-/.exec(ptr)?.[1] ?? 0);
    const sents = body.split(/\n+/).flatMap((l) => l.split(/(?<=[.!?])\s+(?=[A-Z])/)).map((x) => x.trim()).filter((x) => x.length > 25);
    const ranked = sents.map((x) => ({ x, n: terms.reduce((k, t) => k + (x.toLowerCase().includes(t) ? 1 : 0), 0) })).sort((a, c) => c.n - a.n).slice(0, 3);
    for (const r of ranked) { const i = body.indexOf(r.x); if (i >= 0) lines.push(`- ${r.x.replace(/^[-*]\s+/, '')} [[${ptr.replace(/chars_\d+-\d+$/, `chars_${base + i}-${base + i + r.x.length}`)}]]`); }
  }
  const upstream = [...prompt.matchAll(/^- .*\[\[ep:[^\]]+\]\]$/gm)].map((m) => m[0]);
  return (lines.length ? lines : upstream).join('\n') || '- Nothing in the inputs matched this step.';
}

export function installMockHandlers(p: MockProvider): MockProvider {
  return p
    .on('grade', (req) => {
      const deliverable = req.prompt.split('DELIVERABLE:')[1] ?? '';
      const lines = splitUnits(deliverable).filter((l) => /\d/.test(l) && !/^\s*[#|]/.test(l));
      const unsourced = lines.filter((l) => !/\[\[ep:/.test(l)).length;
      const ev = unsourced ? Math.max(0, 1 - unsourced / Math.max(1, lines.length)) : 1;
      const ids = [...(req.prompt.split('DELIVERABLE:')[0] ?? '').matchAll(/^([a-z0-9_]+):/gm)].map((m) => m[1]!);
      const scores: Record<string, number> = {};
      for (const id of ids) scores[id] = id === 'evidence' ? ev : 1;
      return JSON.stringify({ scores, justifications: { evidence: unsourced ? `${unsourced} line(s) lack source pointers` : 'every line carries a pointer' } });
    })
    .on('critic', () => JSON.stringify({ severity: 0.05, issues: [] }))
    .on('synthesize', (req) => req.prompt)
    .on('integrate', (req) => req.prompt.split('SECTIONS:\n')[1] ?? req.prompt)
    .on('review', (req) => {
      // Extract dated sentences; keep the pointer the caller embedded for the document.
      const ptr = /\[\[(ep:[^\]\[]+)\]\]/.exec(req.prompt)?.[1] ?? '';
      // The prompt is "DOCUMENT <path> [[ptr]]\n\n<body>"; offsets must be relative to the body, which is what L2 holds.
      const cut = req.prompt.indexOf('\n\n');
      const text = cut >= 0 ? req.prompt.slice(cut + 2) : req.prompt;
      const out: string[] = [];
      for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
        const m = sentence.match(DATE);
        if (!m) continue;
        const start = text.indexOf(sentence);
        const p = ptr.replace(/chars_\d+-\d+$/, `chars_${Math.max(0, start)}-${Math.max(0, start) + sentence.length}`);
        out.push(`- ${toIsoDate(m[0]!)} — ${sentence.trim().replace(/^[-*+]\s+/, '').replace(/\s+/g, ' ')} [[${p}]]`);
      }
      return out.length ? out.join('\n') : '- No dated events found in this document.';
    })
    .on('chronology', (req) => {
      const lines = req.prompt.split('\n').filter((l) => l.startsWith('- '));
      lines.sort();
      return `# Chronology\n\n${lines.join('\n')}`;
    })
    .on('draft', (req) => {
      const to = /TO: (.+)/.exec(req.prompt)?.[1]?.trim() ?? 'Counsel';
      const goal = /GOAL: (.+)/.exec(req.prompt)?.[1] ?? '';
      const facts = pickSentences(req.prompt, goal, 2).map((x) => `${x.sentence.replace(/[.]$/, '')} [[${x.pointer}]].`).join(' ');
      return `Dear ${to.split('@')[0]},\n\nThank you for your message. ${facts || 'We are reviewing the file and will revert shortly.'} We will follow up with a proposed schedule.\n\nRegards,\nMurphy Orlando LLP`;
    })
    .on('research_plan', () => '{}')
    .on('research_answer', (req) => {
      const q = (/QUESTION: (.+)/.exec(req.prompt)?.[1] ?? '').toLowerCase();
      const terms = q.split(/[^a-z0-9]+/).filter((t) => t.length > 3);
      const blocks = [...req.prompt.matchAll(/\[S(\d)\] ([^:]+): ([\s\S]*?)(?=\n\n\[S\d\]|$)/g)].slice(0, 3);
      if (!blocks.length) return 'The research database has nothing on point yet. Import opinions or add a CourtListener token, then search again.';
      const parts = blocks.map((b) => {
        const sentences = b[3]!.replace(/\[\*\d+\]\s?/g, '').split(/\n+/).flatMap((para) => para.split(/(?<=[.!?][\u201d"]?)\s+(?=[A-Z])/)).map((x) => x.trim()).filter((x) => x.length > 40 && /^[A-Z]/.test(x) && !/Excerpt|omitted|\]$/.test(x) && !/[\u00ab*]/.test(x.slice(0, 3)));
        const best = sentences.map((x) => ({ x, n: terms.reduce((k, t) => k + (x.toLowerCase().includes(t) ? 1 : 0), 0) })).sort((a, b2) => b2.n - a.n)[0]?.x ?? '';
        const clause = best.replace(/^[\u201c"]|[\u201d"]$/g, '').replace(/[.]$/, '');
        return clause ? `${b[2]!.split(',')[0]} explains that "${clause}" [S${b[1]}].` : '';
      }).filter(Boolean);
      return `${parts.join(' ')} These passages come from the research database; read each opinion in full before filing.`;
    })
    .on('research_read', () => '{}')
    .on('research_memo', () => '')
    .on('sumf_support', () => '{}')
    .on('sim_opposing', () => '{}')
    .on('custom', (req) => customStep(req.prompt, req.system))
    .on('workflow_design', () => '{}')
    .on('answer', (req) => {
      const q = (req.prompt.split('MEMORY:')[0] ?? '').replace(/QUESTION:/, '');
      const picked = pickSentences(req.prompt, q, 2);
      if (!picked.length) return 'Memory does not cover that yet. Delegate a run and I will build the record first.';
      return picked.map((x) => `${x.sentence} [[${x.pointer}]]`).join(' ');
    });
}
