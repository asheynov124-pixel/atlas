import type { ElementType } from 'react';

interface RichTextProps {
  html: string;
  as?: ElementType;
  className?: string;
  /** Shown in muted italics when the slot is empty and we are in edit mode. */
  placeholder?: string;
  editable?: boolean;
}

/** Read-mode rendering of a text slot. Edit mode swaps in TipTap. */
export function RichText({ html, as: Tag = 'div', className, placeholder, editable }: RichTextProps) {
  const empty = !html || html.replace(/<[^>]+>/g, '').trim() === '';
  if (empty) {
    if (editable && placeholder) {
      return <Tag className={[className, 'is-empty'].filter(Boolean).join(' ')} data-placeholder={placeholder} />;
    }
    return <Tag className={[className, 'is-empty'].filter(Boolean).join(' ')} aria-hidden="true" />;
  }
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
