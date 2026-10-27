import { createElement, useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { useEditing } from '../reader/context';
import { typeset } from '../model/typeset';

type Tag = 'span' | 'p' | 'h3' | 'h4' | 'div' | 'dd' | 'td';

interface Props {
  value: string;
  onCommit?: (value: string) => void;
  as?: Tag;
  className?: string;
  placeholder?: string;
  /** Shown in Read mode when the value is empty. */
  fallback?: string;
  /** Skip smart quotes (URLs, hex codes, prices). */
  raw?: boolean;
  multiline?: boolean;
  style?: CSSProperties;
  label?: string;
  inputMode?: 'text' | 'decimal' | 'url';
}

/**
 * A plain-text field that is type in Read mode and edits in place in Edit mode. Used
 * for data (names, brands, prices, links) where rich text would be noise.
 */
export function InlineText({
  value,
  onCommit,
  as = 'span',
  className,
  placeholder,
  fallback,
  raw,
  multiline,
  style,
  label,
  inputMode,
}: Props) {
  const editing = useEditing();
  const ref = useRef<HTMLElement>(null);

  if (!editing || !onCommit) {
    if (!value && !fallback) return null;
    return createElement(as, { className: [className, !value && 'is-fallback'].filter(Boolean).join(' '), style }, value || fallback);
  }

  const commit = () => {
    const el = ref.current;
    if (!el) return;
    let next = (el.innerText ?? '').replace(/ /g, ' ');
    next = multiline ? next.replace(/\n{3,}/g, '\n\n').trim() : next.replace(/\s+/g, ' ').trim();
    if (!raw) next = typeset(next);
    if (next !== value) onCommit(next);
    if (el.innerText !== next) el.innerText = next;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      (e.target as HTMLElement).blur();
    } else if (e.key === 'Escape') {
      const el = ref.current;
      if (el) el.innerText = value;
      el?.blur();
    }
  };

  return createElement(
    as,
    {
      ref,
      className: ['inline-edit', className].filter(Boolean).join(' '),
      style,
      contentEditable: 'plaintext-only',
      suppressContentEditableWarning: true,
      spellCheck: !raw,
      role: 'textbox',
      'aria-label': label ?? placeholder,
      'aria-multiline': multiline || undefined,
      'data-placeholder': placeholder,
      inputMode,
      onBlur: commit,
      onKeyDown,
      onPaste: (e: React.ClipboardEvent) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, multiline ? text : text.replace(/\s+/g, ' '));
      },
    },
    value,
  );
}
