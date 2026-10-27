// Rich text in this book is deliberately small: paragraphs, bold, italic, links and
// pull quotes. Anything else (from an imported zip, or a paste that slipped through) is
// reduced to its text.

const KEEP: Record<string, string> = {
  P: 'p',
  BR: 'br',
  STRONG: 'strong',
  B: 'strong',
  EM: 'em',
  I: 'em',
  A: 'a',
  BLOCKQUOTE: 'blockquote',
};

const DROP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'IFRAME', 'OBJECT', 'EMBED', 'NOSCRIPT']);

const SAFE_URL = /^(https?:|mailto:)/i;

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, '&quot;');
}

function walk(node: Node): string {
  if (node.nodeType === 3) return escapeText(node.textContent ?? '');
  if (node.nodeType !== 1) return '';
  const el = node as Element;
  if (DROP.has(el.tagName.toUpperCase())) return '';
  const inner = Array.from(el.childNodes).map(walk).join('');
  const tag = KEEP[el.tagName.toUpperCase()];
  if (!tag) return inner;
  if (tag === 'br') return '<br>';
  if (tag === 'a') {
    const href = el.getAttribute('href') ?? '';
    if (!SAFE_URL.test(href.trim())) return inner;
    return `<a href="${escapeAttr(href.trim())}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
  }
  if (tag === 'blockquote') {
    // A pull quote holds paragraphs; collapse nested blocks into its text.
    const text = inner.replace(/<\/?(p|blockquote)>/g, ' ').replace(/\s+/g, ' ').trim();
    return `<blockquote><p>${text}</p></blockquote>`;
  }
  return `<${tag}>${inner}</${tag}>`;
}

export function sanitizeHtml(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  // Loose inline runs at the top level belong in a paragraph.
  let out = '';
  let run = '';
  for (const node of Array.from(doc.body.childNodes)) {
    const html = walk(node);
    if (/^<(p|blockquote)>/.test(html)) {
      if (run.trim()) out += `<p>${run.trim()}</p>`;
      run = '';
      out += html;
    } else {
      run += html;
    }
  }
  if (run.trim()) out += `<p>${run.trim()}</p>`;
  return out;
}

/** True when the HTML has no visible text. */
export function isBlank(html: string | undefined): boolean {
  return !html || !html.replace(/<[^>]+>/g, '').replace(/&nbsp;|\s/g, '');
}
