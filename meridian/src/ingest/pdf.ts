/**
 * PDF text extraction with layout: pdfjs reads the text layer, items are grouped into
 * visual lines by baseline, lines are numbered per page, and a Bates stamp is detected
 * in the page header or footer. Pages with no text layer are scans; they are sent to an
 * OCR hook (Claude reads PDFs natively in live mode) or marked as pending.
 */
export interface PdfLine { text: string; page: number; line: number; bates?: string; footer?: boolean; ocr?: boolean; pending?: boolean }
export interface PdfPage { page: number; bates?: string; scanned: boolean; ocr: boolean; lines: PdfLine[] }
export type OcrHook = (pagePdfBase64: string, page: number) => Promise<string>;

export const BATES = /\b([A-Z][A-Z0-9]{1,15}(?:[_-][A-Z0-9]{1,12})*[_-]?\d{5,8})\b(?![-_.]\d)/;

interface TextItem { str: string; transform: number[]; hasEOL?: boolean }

export async function extractPdf(bytes: Uint8Array, ocr?: OcrHook): Promise<PdfPage[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true, isEvalSupported: false, useSystemFonts: false, verbosity: 0 }).promise;
  const pages: PdfPage[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = (content.items as TextItem[]).filter((i) => typeof i.str === 'string' && i.str.length > 0);
    // Group by baseline (y), tolerance 2pt; top of page first.
    const rows: Array<{ y: number; parts: Array<{ x: number; s: string }> }> = [];
    for (const it of items) {
      const x = it.transform[4] ?? 0, y = it.transform[5] ?? 0;
      let row = rows.find((r) => Math.abs(r.y - y) < 2);
      if (!row) { row = { y, parts: [] }; rows.push(row); }
      row.parts.push({ x, s: it.str });
    }
    rows.sort((a, b) => b.y - a.y);
    const texts = rows.map((r) => r.parts.sort((a, b) => a.x - b.x).map((q) => q.s).join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
    // Bates: look in the last three and first two lines.
    let bates: string | undefined;
    let batesIdx = -1;
    const candidates = [...texts.map((t, i) => [t, i] as const).slice(-3).reverse(), ...texts.map((t, i) => [t, i] as const).slice(0, 2)];
    for (const [t, i] of candidates) {
      const m = BATES.exec(t);
      if (m && t.length <= 60) { bates = m[1]; batesIdx = i; break; }
    }
    const body = texts.filter((_, i) => i !== batesIdx);
    const scanned = body.join('').replace(/\s/g, '').length < 25;
    let lines: PdfLine[] = [];
    let didOcr = false;
    if (scanned) {
      let transcript = '';
      if (ocr) {
        try { transcript = (await ocr(await singlePagePdf(bytes, p - 1), p)).trim(); didOcr = transcript.length > 0; } catch { transcript = ''; }
      }
      if (didOcr) lines = transcript.split(/\r?\n/).map((t) => t.trim()).filter(Boolean).map((text, i) => ({ text, page: p, line: i + 1, ...(bates ? { bates } : {}), ocr: true }));
      else lines = [{ text: `[Scanned page ${p}: no text layer. OCR runs when live models are enabled.]`, page: p, line: 1, ...(bates ? { bates } : {}), pending: true }];
    } else {
      lines = body.map((text, i) => ({ text, page: p, line: i + 1, ...(bates ? { bates } : {}) }));
    }
    if (bates) lines.push({ text: texts[batesIdx]!, page: p, line: 0, bates, footer: true });
    pages.push({ page: p, ...(bates ? { bates } : {}), scanned, ocr: didOcr, lines });
  }
  await doc.destroy();
  return pages;
}

/** Copy one page into its own PDF so a vision-capable model can transcribe it. */
export async function singlePagePdf(bytes: Uint8Array, pageIndex: number): Promise<string> {
  const { PDFDocument } = await import('pdf-lib');
  const src = await PDFDocument.load(bytes);
  const out = await PDFDocument.create();
  const [copied] = await out.copyPages(src, [pageIndex]);
  out.addPage(copied!);
  return Buffer.from(await out.save()).toString('base64');
}
