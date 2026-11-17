// Typesetting on commit: the small things a compositor would fix without asking.
//   "quotes"  → “quotes”      it's  → it’s      '90s → ’90s
//   60"       → 60″           12'   → 12′       2-3   → 2–3
//   a -- b    → a – b         ...   → …

const OPENERS = /[\s([{—– -]/;

function typesetText(text: string, before: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const prev = i === 0 ? before : text[i - 1];
    const next = text[i + 1] ?? '';
    if (c === '"') {
      if (/\d/.test(prev)) out += '″';
      else out += prev === '' || OPENERS.test(prev) ? '“' : '”';
    } else if (c === "'") {
      if (/\d/.test(prev) && !/[a-z]/i.test(next)) out += '′';
      else if ((prev === '' || OPENERS.test(prev) || prev === '“') && /[a-z]/i.test(next)) out += '‘';
      else out += '’';
    } else {
      out += c;
    }
  }
  return out
    .replace(/\.\.\./g, '…')
    .replace(/ -- /g, ' – ')
    .replace(/--/g, '–')
    .replace(/ - /g, ' – ')
    .replace(/(\d)-(\d)/g, '$1–$2');
}

/** Typeset plain text. */
export function typeset(text: string): string {
  return typesetText(text, '');
}

/** Typeset the text nodes of a small HTML fragment, leaving tags and attributes alone. */
export function typesetHtml(html: string): string {
  const parts = html.split(/(<[^>]+>)/);
  let last = '';
  return parts
    .map((part) => {
      if (part.startsWith('<')) {
        // A block boundary starts a fresh line for quote direction.
        if (/^<\/?(p|blockquote|br)\b/i.test(part)) last = '';
        return part;
      }
      const decoded = part.replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      const set = typesetText(decoded, last);
      if (set.length) last = set[set.length - 1];
      return set;
    })
    .join('');
}

/** Plain text of an HTML fragment, for word counts and accessible names. */
export function plainText(html: string): string {
  return html
    .replace(/<\/(p|blockquote)>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function wordCount(html: string): number {
  const t = plainText(html);
  return t ? t.split(' ').length : 0;
}
