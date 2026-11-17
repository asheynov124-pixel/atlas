/**
 * Trigger extraction: finds events in matter documents that start a deadline clock, with
 * the pointer to the sentence that proves the date. Deterministic patterns run in every
 * mode; live models can add triggers the patterns miss (they still need a pointer).
 */
import type { TriggerKind } from './rules.js';
import { toIsoDate } from '../app/mockHandlers.js';

export interface FoundTrigger { kind: TriggerKind; date: string; sentence: string; start: number; end: number; label: string; days?: number; clause?: string }

const DATE = String.raw`((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2}|20\d{2}-\d{2}-\d{2})`;
const WORDNUM: Record<string, number> = { seven: 7, ten: 10, fourteen: 14, fifteen: 15, twenty: 20, thirty: 30, 'forty-five': 45, sixty: 60, ninety: 90 };

const PATTERNS: Array<{ kind: TriggerKind; rx: RegExp; label: string }> = [
  { kind: 'complaint_served', rx: new RegExp(String.raw`served[\s\S]{0,60}?summons and complaint[\s\S]{0,240}?on\s+${DATE}`, 'i'), label: 'Summons and complaint served' },
  { kind: 'complaint_served', rx: new RegExp(String.raw`summons and complaint[\s\S]{0,240}?served[\s\S]{0,120}?on\s+${DATE}`, 'i'), label: 'Summons and complaint served' },
  { kind: 'interrogatories_served', rx: new RegExp(String.raw`interrogatories[\s\S]{0,200}?served[\s\S]{0,80}?on\s+${DATE}`, 'i'), label: 'Interrogatories served' },
  { kind: 'document_requests_served', rx: new RegExp(String.raw`(?:notice to produce|request(?:s)? for (?:the )?production)[\s\S]{0,200}?served[\s\S]{0,80}?on\s+${DATE}`, 'i'), label: 'Document requests served' },
  { kind: 'admissions_served', rx: new RegExp(String.raw`requests? for admissions?[\s\S]{0,200}?served[\s\S]{0,80}?on\s+${DATE}`, 'i'), label: 'Requests for admission served' },
  { kind: 'final_judgment_entered', rx: new RegExp(String.raw`final judgment[\s\S]{0,160}?entered[\s\S]{0,40}?on\s+${DATE}`, 'i'), label: 'Final judgment entered' },
  { kind: 'order_served', rx: new RegExp(String.raw`order[\s\S]{0,160}?served[\s\S]{0,40}?on\s+${DATE}`, 'i'), label: 'Order served' },
  { kind: 'sj_return_date', rx: new RegExp(String.raw`summary judgment[\s\S]{0,400}?return(?:able| date)[\s\S]{0,40}?(?:on\s+|:\s*|is\s+)?(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday),\s+)?${DATE}`, 'i'), label: 'Summary judgment return date' },
  { kind: 'motion_return_date', rx: new RegExp(String.raw`notice of motion[\s\S]{0,300}?return(?:able| date)[\s\S]{0,40}?(?:on\s+|:\s*)?(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday),\s+)?${DATE}`, 'i'), label: 'Motion return date' },
];

export function findTriggers(text: string): FoundTrigger[] {
  const out: FoundTrigger[] = [];
  const seenKinds = new Set<string>();
  for (const p of PATTERNS) {
    if (seenKinds.has(p.kind)) continue;
    const m = p.rx.exec(text);
    if (!m) continue;
    seenKinds.add(p.kind);
    if (p.kind === 'motion_return_date' && /summary judgment/i.test(m[0])) continue;
    const date = toIsoDate(m[1]!);
    // Pointer covers the sentence holding the date.
    const dateAt = m.index + m[0].lastIndexOf(m[1]!);
    const start = Math.max(text.lastIndexOf('\n', dateAt) + 1, m.index);
    const endNl = text.indexOf('\n', dateAt);
    const end = endNl < 0 ? text.length : endNl;
    out.push({ kind: p.kind, date, sentence: text.slice(start, end).trim(), start, end, label: p.label });
  }
  // Contract clocks: "within ninety days of notice, i.e., by April 29, 2026" or "within 90 days after ...".
  const crx = new RegExp(String.raw`(Section\s+[\d.]+)?[^.\n]{0,80}?within\s+(\d{1,3}|seven|ten|fourteen|fifteen|twenty|thirty|forty-five|sixty|ninety)\s+days\s+(?:of|after)\s+([a-z ]{3,40})`, 'gi');
  for (const m of text.matchAll(crx)) {
    const days = /^\d+$/.test(m[2]!) ? Number(m[2]) : WORDNUM[m[2]!.toLowerCase()] ?? 0;
    if (!days) continue;
    const lineStart = text.lastIndexOf('\n', m.index!) + 1;
    const lineEnd = text.indexOf('\n', m.index!);
    const sentence = text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd).trim();
    out.push({ kind: 'contract_event', date: '', sentence, start: lineStart, end: lineEnd < 0 ? text.length : lineEnd, label: `${m[1] ? `${m[1].trim()}: ` : ''}within ${days} days of ${m[3]!.trim()}`, days, clause: m[1]?.trim() ?? 'Contract' });
  }
  return out;
}
