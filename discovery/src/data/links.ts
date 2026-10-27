/** Paste-link parsing. Pure and source-agnostic so a live source can reuse it. */

export interface ParsedLink {
  url: string;
  host: string;
  /** Id extracted from a `viewkey`/`v`/`id` query param or an /video/<id>-style path. */
  id?: string;
  matchedBy: 'viewkey' | 'path-id' | 'hash';
}

const ID_PARAMS = ['viewkey', 'v', 'id', 'video', 'vid'];
const ID_PATH = /\/(?:video|videos|v|watch|view|embed|clip)\/([A-Za-z0-9_-]{4,64})/;

/** Accepts bare hosts ("example.com/v/abc") as well as full URLs. */
export function looksLikeUrl(text: string): boolean {
  const t = text.trim();
  if (!t || /\s/.test(t)) return false;
  return /^https?:\/\//i.test(t) || /^[\w-]+(\.[\w-]+)+\/\S*/.test(t);
}

export function parseLink(text: string): ParsedLink | null {
  const raw = text.trim();
  if (!looksLikeUrl(raw)) return null;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, '');
  for (const key of ID_PARAMS) {
    const v = u.searchParams.get(key);
    if (v && /^[A-Za-z0-9_-]{4,64}$/.test(v)) return { url: u.toString(), host, id: v, matchedBy: 'viewkey' };
  }
  const m = u.pathname.match(ID_PATH);
  if (m) return { url: u.toString(), host, id: m[1], matchedBy: 'path-id' };
  return { url: u.toString(), host, matchedBy: 'hash' };
}
