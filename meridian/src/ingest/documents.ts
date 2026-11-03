/**
 * Document index for a matter. Every document is ingested once into L2 (verbatim,
 * append-only) as `ep:docs/<doc_id>/...`, with a line map so any pointer converts to
 * a human record cite:
 *   PDF with Bates   HARBOR_000403, p. 3, ll. 2–4
 *   PDF without      Production.pdf, p. 3, ll. 2–4
 *   Text / email     02-cinder-correspondence.eml, ll. 9–10
 * OCR'd lines are marked "(OCR)" so nobody files a cite to a machine transcription unawares.
 */
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, extname } from 'node:path';
import type { SpanPointer } from '../core/types.js';
import { EpisodicStore, makePointer, parsePointer } from '../memory/episodic.js';
import { extractPdf, type OcrHook, BATES } from './pdf.js';

export interface DocLine { page: number; line: number; start: number; end: number; bates?: string; ocr?: boolean; pending?: boolean }
export interface DocRecord {
  id: string; name: string; rel: string; kind: 'pdf' | 'text' | 'email' | 'html';
  pages: number; bates_first?: string; bates_last?: string; scanned_pages: number[]; ocr_pages: number[];
  lines: DocLine[]; pointer: SpanPointer; chars: number; sha256: string; ingested_at: string;
}

export const DOC_RUN = 'docs';
export const SUPPORTED = new Set(['.pdf', '.txt', '.md', '.eml', '.csv', '.json', '.html', '.htm']);

export function docIdFor(rel: string): string {
  return rel.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'doc';
}

function htmlToText(html: string): string {
  return html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d|tr)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n');
}

export class DocumentIndex {
  private docs = new Map<string, DocRecord>();

  constructor(readonly l2: EpisodicStore, readonly workspace_id: string, private ocr?: OcrHook) {}

  setOcr(ocr: OcrHook | undefined): void { this.ocr = ocr; }

  list(): DocRecord[] { return [...this.docs.values()].sort((a, b) => a.rel.localeCompare(b.rel)); }
  get(id: string): DocRecord | undefined { return this.docs.get(id); }
  byRel(rel: string): DocRecord | undefined { return this.list().find((d) => d.rel === rel); }
  text(id: string): string { return this.l2.get(DOC_RUN, id)?.text ?? ''; }

  serialize(): DocRecord[] { return this.list(); }
  restore(docs: DocRecord[]): void { this.docs = new Map(docs.map((d) => [d.id, d])); }

  /** Ingest a file. Re-ingesting identical bytes is a no-op; changed bytes get a new version id (L2 is append-only). */
  async ingest(absPath: string, rel: string): Promise<{ doc: DocRecord; created: boolean }> {
    const bytes = new Uint8Array(await readFile(absPath));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const existing = this.byRel(rel);
    if (existing && existing.sha256 === sha256) return { doc: existing, created: false };
    const ext = extname(rel).toLowerCase();
    let id = docIdFor(rel);
    if (this.docs.has(id) || this.l2.has(DOC_RUN, id)) { let n = 2; while (this.docs.has(`${id}-v${n}`) || this.l2.has(DOC_RUN, `${id}-v${n}`)) n++; id = `${id}-v${n}`; }

    let text = '';
    const lines: DocLine[] = [];
    let pages = 1;
    const scanned: number[] = [];
    const ocrPages: number[] = [];
    let kind: DocRecord['kind'] = 'text';
    if (ext === '.pdf') {
      kind = 'pdf';
      const pp = await extractPdf(bytes, this.ocr);
      pages = pp.length;
      const parts: string[] = [];
      let offset = 0;
      for (const p of pp) {
        if (p.scanned) scanned.push(p.page);
        if (p.ocr) ocrPages.push(p.page);
        for (const l of p.lines) {
          if (l.footer) continue;
          parts.push(l.text);
          lines.push({ page: p.page, line: l.line, start: offset, end: offset + l.text.length, ...(p.bates ? { bates: p.bates } : {}), ...(l.ocr ? { ocr: true } : {}), ...(l.pending ? { pending: true } : {}) });
          offset += l.text.length + 1;
        }
        // Page break marker keeps pages visually separate without being citable text.
        parts.push('');
        offset += 1;
      }
      text = parts.join('\n');
    } else {
      const raw = Buffer.from(bytes).toString('utf8');
      kind = ext === '.eml' ? 'email' : ext === '.html' || ext === '.htm' ? 'html' : 'text';
      text = kind === 'html' ? htmlToText(raw) : raw.replace(/\r\n/g, '\n');
      let offset = 0, page = 1, line = 0;
      for (const segment of text.split('\n')) {
        if (segment.includes('\f')) { page += segment.split('\f').length - 1; line = 0; }
        line += 1;
        if (segment.trim()) {
          const bm = BATES.exec(segment.trim());
          const bates = bm && bm[0] === segment.trim().replace(/^Bates:\s*/i, '') ? bm[1] : undefined;
          lines.push({ page, line, start: offset, end: offset + segment.length, ...(bates ? { bates } : {}) });
        }
        offset += segment.length + 1;
      }
      pages = page;
    }
    const pointer = this.l2.append({ run_id: DOC_RUN, turn_id: id, role: 'tool', text, trusted: false, source: rel }, this.workspace_id);
    const bates = lines.map((l) => l.bates).filter((b): b is string => !!b);
    const doc: DocRecord = { id, name: basename(rel), rel, kind, pages, ...(bates[0] ? { bates_first: bates[0], bates_last: bates[bates.length - 1]! } : {}), scanned_pages: scanned, ocr_pages: ocrPages, lines, pointer, chars: text.length, sha256, ingested_at: new Date().toISOString() };
    if (existing) this.docs.delete(existing.id);
    this.docs.set(id, doc);
    return { doc, created: true };
  }

  async ingestIfChanged(absPath: string, rel: string): Promise<{ doc: DocRecord; created: boolean } | null> {
    try { const s = await stat(absPath); if (!s.isFile() || s.size > 50_000_000) return null; } catch { return null; }
    if (!SUPPORTED.has(extname(rel).toLowerCase())) return null;
    return this.ingest(absPath, rel);
  }

  linesFor(pointer: string): { doc: DocRecord; lines: DocLine[]; start: number; end: number } | null {
    const p = parsePointer(pointer);
    if (!p || p.run_id !== DOC_RUN) return null;
    const doc = this.docs.get(p.turn_id);
    if (!doc) return null;
    const lines = doc.lines.filter((l) => l.end > p.start && l.start < p.end);
    return { doc, lines, start: p.start, end: p.end };
  }

  /** Human record cite for a pointer, or null when the pointer is not a matter document. */
  citeFor(pointer: string): string | null {
    const hit = this.linesFor(pointer);
    if (!hit) return null;
    const { doc, lines } = hit;
    if (!lines.length) return doc.name;
    return formatCite(doc, lines);
  }

  /** Pointer for a Bates page and optional line range, e.g. ("HARBOR_000403", 2, 4). */
  pointerForBates(bates: string, from?: number, to?: number): { pointer: SpanPointer; doc: DocRecord } | null {
    for (const doc of this.docs.values()) {
      const pageLines = doc.lines.filter((l) => l.bates === bates);
      if (!pageLines.length) continue;
      const sel = from ? pageLines.filter((l) => l.line >= from && l.line <= (to ?? from)) : pageLines;
      if (!sel.length) return null;
      return { pointer: makePointer(DOC_RUN, doc.id, sel[0]!.start, sel[sel.length - 1]!.end), doc };
    }
    return null;
  }

  /** Pointer for a page/line range in a named document (deposition style 12:3-9 uses page 12). */
  pointerForLines(doc: DocRecord, page: number | undefined, from: number, to: number): SpanPointer | null {
    const sel = doc.lines.filter((l) => (page === undefined || l.page === page) && l.line >= from && l.line <= to);
    if (!sel.length) return null;
    return makePointer(DOC_RUN, doc.id, sel[0]!.start, sel[sel.length - 1]!.end);
  }

  findDoc(ref: string): DocRecord | undefined {
    const r = ref.toLowerCase().trim();
    return this.list().find((d) => d.rel.toLowerCase() === r || d.name.toLowerCase() === r || d.id === docIdFor(r) || d.name.toLowerCase().startsWith(r));
  }
}

export function formatCite(doc: DocRecord, lines: DocLine[]): string {
  const first = lines[0]!, last = lines[lines.length - 1]!;
  const ocr = lines.some((l) => l.ocr) ? ' (OCR)' : '';
  const ll = (a: number, b: number) => (a === b ? `l. ${a}` : `ll. ${a}–${b}`);
  if (doc.kind === 'pdf') {
    if (first.page === last.page) {
      const head = first.bates ?? doc.name;
      return `${head}, p. ${first.page}, ${ll(first.line, last.line)}${ocr}`;
    }
    const head = first.bates && last.bates ? `${first.bates}–${last.bates}` : doc.name;
    return `${head}, pp. ${first.page}–${last.page}${ocr}`;
  }
  if (doc.pages > 1) return first.page === last.page ? `${doc.name} ${first.page}:${first.line === last.line ? first.line : `${first.line}–${last.line}`}` : `${doc.name} ${first.page}:${first.line}–${last.page}:${last.line}`;
  return `${doc.name}, ${ll(first.line, last.line)}${ocr}`;
}
