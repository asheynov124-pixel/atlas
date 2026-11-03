/**
 * Split a deliverable into claim units for evidence checking. List items, table rows
 * and headings are one unit per line; prose is split at sentence boundaries that are
 * followed by a capital letter, so "Inc. v. Cinder" stays whole. A fragment that is
 * nothing but pointers or markers is folded back into the sentence before it, so
 * "…by April 29, 2026. [[ep:…]]" counts as a sourced sentence.
 */
const LEADING_POINTERS = /^(\s*(\[\[ep:[^\]\[]+\]\]|⟦\d+⟧))+\s*/;
const ONLY_POINTERS = /^(\s*(\[\[ep:[^\]\[]+\]\]|⟦\d+⟧)\s*)+$/;

export function splitUnits(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    if (/^([-*+]|\d+[.)]|\||#)/.test(t)) { out.push(t); continue; }
    for (const raw of t.split(/(?<=[.!?])\s+(?=[A-Z(“"⟦\[])/)) {
      let s = raw.trim();
      if (!s) continue;
      // Pointers that follow a sentence's full stop belong to that sentence, not the next one.
      const lead = LEADING_POINTERS.exec(s);
      if (lead && out.length) { out[out.length - 1] += ` ${lead[0].trim()}`; s = s.slice(lead[0].length).trim(); }
      if (!s) continue;
      if (ONLY_POINTERS.test(s) && out.length) out[out.length - 1] += ` ${s}`;
      else out.push(s);
    }
  }
  return out;
}
