import { useEffect, useRef, type ElementType, type KeyboardEvent } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import { stripHtml } from '@/book/slots';
import { setSlotHtml } from '@/state/actions';
import { textToHtml, useEditSession } from './session';
import styles from './EditableText.module.css';

interface InlineProps {
  spreadId: string;
  slotKey: string;
  html: string;
  as?: ElementType;
  className?: string;
  placeholder?: string;
  /** Called instead of setSlotHtml when provided (decision "why", captions in sub-slots...). */
  onCommit?: (html: string) => void;
  multiline?: boolean;
}

/**
 * Single-field editing (titles, captions, quotes): plain text, edited in
 * place, stored as escaped HTML. Enter commits; Shift+Enter breaks a line
 * when multiline.
 */
export function InlineText({ spreadId, slotKey, html, as: Tag = 'div', className, placeholder, onCommit, multiline }: InlineProps) {
  const ref = useRef<HTMLElement>(null);
  const { change, end } = useEditSession();
  const text = stripHtml(html.replace(/<br\s*\/?>/gi, '\n'));

  // The text lives in the DOM, not in React children, so typing never resets the caret.
  useEffect(() => {
    const el = ref.current;
    if (!el || document.activeElement === el) return;
    if (el.textContent !== text) el.textContent = text;
  }, [text]);

  const commit = (value: string) => {
    const next = textToHtml(value.replace(/\n+$/, ''));
    if (next === html) return;
    change(() => (onCommit ? onCommit(next) : setSlotHtml(spreadId, slotKey, next)));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' && !(multiline && e.shiftKey)) {
      e.preventDefault();
      (e.currentTarget as HTMLElement).blur();
    }
    if (e.key === 'Escape') (e.currentTarget as HTMLElement).blur();
    e.stopPropagation();
  };

  return (
    <Tag
      ref={ref}
      className={[styles.inline, className].filter(Boolean).join(' ')}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      role="textbox"
      aria-label={placeholder ?? slotKey}
      aria-multiline={multiline ? 'true' : 'false'}
      data-placeholder={placeholder}
      data-slot={slotKey}
      spellCheck
      onInput={(e: React.FormEvent<HTMLElement>) => commit((e.currentTarget as HTMLElement).innerText)}
      onBlur={(e: React.FocusEvent<HTMLElement>) => {
        commit((e.currentTarget as HTMLElement).innerText);
        end();
      }}
      onKeyDown={onKeyDown}
      onPaste={(e: React.ClipboardEvent<HTMLElement>) => {
        e.preventDefault();
        const t = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, multiline ? t : t.replace(/\s*\n+\s*/g, ' '));
      }}
    />
  );
}

interface RichProps {
  spreadId: string;
  slotKey: string;
  html: string;
  className?: string;
  placeholder?: string;
}

/** Essay bodies: TipTap with bold, italic, link and pull quote. Paste strips formatting. */
export function RichTextEditor({ spreadId, slotKey, html, className, placeholder }: RichProps) {
  const { change, end } = useEditSession();
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        underline: false,
        dropcursor: false,
        gapcursor: false,
        trailingNode: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      }),
      Placeholder.configure({ placeholder: placeholder ?? 'Write…' }),
    ],
    content: html,
    editorProps: {
      attributes: { 'data-slot': slotKey, 'aria-label': placeholder ?? slotKey },
      transformPastedHTML: (pasted) => `<p>${textToHtml(stripHtml(pasted))}</p>`,
    },
    onUpdate: ({ editor: ed }) => {
      const next = ed.isEmpty ? '' : ed.getHTML();
      if (next !== html) change(() => setSlotHtml(spreadId, slotKey, next));
    },
    onBlur: () => end(),
  });

  // external changes (undo, import) flow back into the editor
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const current = editor.isEmpty ? '' : editor.getHTML();
    if (current !== html) editor.commands.setContent(html || '', { emitUpdate: false });
  }, [html, editor]);

  if (!editor) return <div className={className} />;

  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link to', prev ?? 'https://');
    if (url === null) return;
    if (url === '' || url === 'https://') editor.chain().focus().unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <>
      <BubbleMenu editor={editor} className={styles.bubble} options={{ placement: 'top' }}>
        <button type="button" className={styles.b} onClick={() => editor.chain().focus().toggleBold().run()} data-active={editor.isActive('bold') ? 'true' : 'false'} aria-label="Bold">B</button>
        <button type="button" className={styles.i} onClick={() => editor.chain().focus().toggleItalic().run()} data-active={editor.isActive('italic') ? 'true' : 'false'} aria-label="Italic">i</button>
        <button type="button" onClick={setLink} data-active={editor.isActive('link') ? 'true' : 'false'} aria-label="Link">Link</button>
        <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} data-active={editor.isActive('blockquote') ? 'true' : 'false'} aria-label="Pull quote">Quote</button>
      </BubbleMenu>
      <EditorContent editor={editor} className={[styles.rich, className].filter(Boolean).join(' ')} />
    </>
  );
}
