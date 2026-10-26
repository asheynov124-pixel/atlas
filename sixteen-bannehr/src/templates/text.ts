import { plainText } from '../model/typeset';

/** A plain string (book title, chapter title) as one paragraph of HTML for the editor. */
export function asHtml(text: string): string {
  if (!text) return '';
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<p>${esc}</p>`;
}

/** Back from the editor to a plain string. */
export function asText(html: string): string {
  return plainText(html);
}
