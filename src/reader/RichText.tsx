import type { ElementType } from 'react';
import { useContext } from 'react';
import { InlineText, RichTextEditor } from '@/editor/EditableText';
import { SpreadContext } from './SpreadContext';

interface RichTextProps {
  html: string;
  as?: ElementType;
  className?: string;
  /** Shown in muted italics when the slot is empty and we are in edit mode. */
  placeholder?: string;
  editable?: boolean;
  /** Slot key: when the spread is editable, this becomes an in-place editor. */
  slotKey?: string;
  /** 'rich' for essay bodies (TipTap); 'inline' plain text otherwise. */
  kind?: 'inline' | 'rich';
  multiline?: boolean;
  onCommit?: (html: string) => void;
}

/** A text slot. Reads as HTML; in Edit mode it is edited in place. */
export function RichText({ html, as: Tag = 'div', className, placeholder, editable, slotKey, kind = 'inline', multiline, onCommit }: RichTextProps) {
  const ctx = useContext(SpreadContext);
  const canEdit = (editable ?? ctx?.editable) && slotKey && ctx;
  if (canEdit) {
    if (kind === 'rich') {
      return <RichTextEditor spreadId={ctx.ref.spread.id} slotKey={slotKey} html={html} className={className} placeholder={placeholder} />;
    }
    return (
      <InlineText spreadId={ctx.ref.spread.id} slotKey={slotKey} html={html} as={Tag} className={className} placeholder={placeholder} multiline={multiline} onCommit={onCommit} />
    );
  }
  const empty = !html || html.replace(/<[^>]+>/g, '').trim() === '';
  if (empty) {
    return <Tag className={[className, 'is-empty'].filter(Boolean).join(' ')} aria-hidden="true" />;
  }
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
