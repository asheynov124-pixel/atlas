/**
 * Bulk title editing: pattern operations over a selection, plus an undo/redo
 * history that coalesces bursts of typing into one step.
 */
import { filenameOf, hostOf, prettyFilename } from './urls';

export interface TitleSubject {
  id: string;
  title: string;
  url: string;
  originalUrl?: string;
}

export type TitleOp =
  | { kind: 'prefix'; text: string }
  | { kind: 'suffix'; text: string }
  | { kind: 'replace'; find: string; replace: string; regex?: boolean; caseSensitive?: boolean }
  | { kind: 'capitalize' }
  | { kind: 'titleCase' }
  | { kind: 'filename' }
  | { kind: 'hostNumber'; start?: number }
  | { kind: 'set'; text: string };

export type Titles = Record<string, string>;

const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'nor', 'of', 'on', 'or', 'the', 'to', 'vs', 'via', 'with']);

/** Title Case that keeps small words low, acronyms intact, and handles hyphens. */
export function toTitleCase(s: string): string {
  const words = s.trim().split(/(\s+)/);
  const real = words.filter((w) => w.trim()).length;
  let n = 0;
  return words
    .map((w) => {
      if (!w.trim()) return w;
      const i = n++;
      const edge = i === 0 || i === real - 1;
      return w
        .split('-')
        .map((part, j) => {
          if (!part) return part;
          if (/^[A-Z0-9]{2,5}$/.test(part) && /[A-Z]/.test(part)) return part; // HD, 4K, NYC
          if (/[a-z][A-Z]/.test(part)) return part; // iPhone, McKenzie
          const lower = part.toLowerCase();
          // Small words stay low mid-title and inside compounds ("End-of-Summer").
          if ((j > 0 || !edge) && SMALL.has(lower)) return lower;
          return lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join('-');
    })
    .join('');
}

export function capitalize(s: string): string {
  const t = s.trimStart();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Throws a readable error for an invalid regular expression. */
export function buildFind(op: Extract<TitleOp, { kind: 'replace' }>): RegExp {
  const flags = op.caseSensitive ? 'g' : 'gi';
  try {
    return new RegExp(op.regex ? op.find : escapeRe(op.find), flags);
  } catch (e) {
    throw new Error(`That pattern isn’t valid: ${(e as Error).message.replace(/^Invalid regular expression: /, '')}`);
  }
}

/**
 * Apply one operation. `selected` limits it to those ids (null = every
 * subject). Returns the full title map, unchanged entries included.
 */
export function applyTitleOp(subjects: TitleSubject[], current: Titles, op: TitleOp, selected: Set<string> | null = null): Titles {
  const next: Titles = { ...current };
  const targets = subjects.filter((s) => !selected || selected.has(s.id));
  const re = op.kind === 'replace' && op.find ? buildFind(op) : null;
  const perHost = new Map<string, number>();
  for (const s of targets) {
    const title = current[s.id] ?? s.title;
    let out = title;
    switch (op.kind) {
      case 'prefix':
        out = op.text + title;
        break;
      case 'suffix':
        out = title + op.text;
        break;
      case 'replace':
        out = re ? title.replace(re, op.regex ? op.replace : op.replace.replace(/\$/g, '$$$$')) : title;
        break;
      case 'capitalize':
        out = capitalize(title);
        break;
      case 'titleCase':
        out = toTitleCase(title);
        break;
      case 'filename':
        out = prettyFilename(s.url) || filenameOf(s.url) || title;
        break;
      case 'hostNumber': {
        const host = hostOf(s.originalUrl || s.url) || hostOf(s.url) || 'Import';
        const n = (perHost.get(host) ?? (op.start ?? 1) - 1) + 1;
        perHost.set(host, n);
        out = `${host} – ${n}`;
        break;
      }
      case 'set':
        out = op.text;
        break;
    }
    next[s.id] = out.replace(/\s+/g, ' ').trim().slice(0, 140) || title;
  }
  return next;
}

export function changedCount(before: Titles, after: Titles): number {
  return Object.keys(after).filter((k) => before[k] !== after[k]).length;
}

// ---------------------------------------------------------------------------
// Undo / redo

export interface TitleHistory {
  past: Titles[];
  present: Titles;
  future: Titles[];
  /** Typing into the same field within `COALESCE_MS` extends the last step. */
  lastKey?: string;
  lastAt?: number;
}

const LIMIT = 100;
export const COALESCE_MS = 1000;

export function historyInit(titles: Titles): TitleHistory {
  return { past: [], present: titles, future: [] };
}

export function historyCommit(h: TitleHistory, next: Titles, opts: { key?: string; now?: number } = {}): TitleHistory {
  if (changedCount(h.present, next) === 0) return h;
  const now = opts.now ?? Date.now();
  const coalesce = !!opts.key && opts.key === h.lastKey && h.lastAt !== undefined && now - h.lastAt < COALESCE_MS && h.past.length > 0;
  return {
    past: coalesce ? h.past : [...h.past, h.present].slice(-LIMIT),
    present: next,
    future: [],
    lastKey: opts.key,
    lastAt: now,
  };
}

export function historyUndo(h: TitleHistory): TitleHistory {
  if (!h.past.length) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}

export function historyRedo(h: TitleHistory): TitleHistory {
  if (!h.future.length) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}

export const canUndo = (h: TitleHistory) => h.past.length > 0;
export const canRedo = (h: TitleHistory) => h.future.length > 0;
