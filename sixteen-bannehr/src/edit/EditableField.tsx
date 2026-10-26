import { createElement, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { Document } from '@tiptap/extension-document';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Text } from '@tiptap/extension-text';
import { Bold } from '@tiptap/extension-bold';
import { Italic } from '@tiptap/extension-italic';
import { Link } from '@tiptap/extension-link';
import { Blockquote } from '@tiptap/extension-blockquote';
import { HardBreak } from '@tiptap/extension-hard-break';
import { Placeholder, UndoRedo } from '@tiptap/extensions';
import { Fragment, Slice } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import { inline, type EditableProps } from '../templates/kit';
import { sanitizeHtml, isBlank } from '../model/sanitize';
import { typesetHtml } from '../model/typeset';

/**
 * Text that edits where it sits. At rest it is ordinary type with a quiet affordance;
 * focused, a small TipTap editor takes its place with identical typography. Blur
 * commits (one undo step), Escape cancels, Enter commits a single line.
 */
export default function EditableField(props: EditableProps) {
  const { html, as = 'div', className, single, placeholder, style, id } = props;
  const [active, setActive] = useState(false);
  const clickAt = useRef<{ x: number; y: number } | null>(null);

  if (active) {
    return (
      <RichField
        {...props}
        clickAt={clickAt.current}
        onDone={(next) => {
          setActive(false);
          if (next !== null && next !== html) props.onCommit?.(next);
        }}
      />
    );
  }

  const empty = isBlank(html);
  return createElement(as, {
    id,
    style,
    className: ['editable', className, empty && 'is-empty'].filter(Boolean).join(' '),
    tabIndex: 0,
    role: 'textbox',
    'aria-label': placeholder ?? 'Text',
    'aria-multiline': !single || undefined,
    'data-placeholder': placeholder,
    onMouseDown: (e: React.MouseEvent) => {
      clickAt.current = { x: e.clientX, y: e.clientY };
    },
    onFocus: () => setActive(true),
    dangerouslySetInnerHTML: { __html: empty ? '' : single ? inline(sanitizeHtml(html)) : sanitizeHtml(html) },
  });
}

function normalise(editor: Editor, single?: boolean): string {
  if (editor.isEmpty) return '';
  let html = typesetHtml(sanitizeHtml(editor.getHTML()));
  if (single) {
    const first = html.match(/<p>[\s\S]*?<\/p>/);
    html = first ? first[0] : `<p>${html.replace(/<[^>]+>/g, '')}</p>`;
  }
  return isBlank(html) ? '' : html;
}

function pastePlain(view: EditorView, event: ClipboardEvent, single?: boolean): boolean {
  const text = event.clipboardData?.getData('text/plain');
  if (text === undefined) return false;
  event.preventDefault();
  if (single) {
    view.dispatch(view.state.tr.insertText(text.replace(/\s+/g, ' ').trim()));
    return true;
  }
  const paras = text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\n/g, ' ').trim())
    .filter(Boolean);
  if (paras.length <= 1) {
    view.dispatch(view.state.tr.insertText(paras[0] ?? ''));
    return true;
  }
  const { schema } = view.state;
  const nodes = paras.map((p) => schema.nodes.paragraph.create(null, schema.text(p)));
  view.dispatch(view.state.tr.replaceSelection(new Slice(Fragment.fromArray(nodes), 1, 1)).scrollIntoView());
  return true;
}

function RichField({
  html,
  className,
  single,
  placeholder,
  style,
  clickAt,
  onDone,
}: EditableProps & { clickAt: { x: number; y: number } | null; onDone: (html: string | null) => void }) {
  const holdBlur = useRef(false);
  const finished = useRef(false);
  const wrap = useRef<HTMLDivElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);

  const finish = (editor: Editor | null, keep: boolean) => {
    if (finished.current) return;
    finished.current = true;
    onDone(keep && editor ? normalise(editor, single) : null);
  };

  const editor = useEditor({
    extensions: [
      single ? Document.extend({ content: 'paragraph' }) : Document,
      Paragraph,
      Text,
      Bold,
      Italic,
      Link.configure({ openOnClick: false, autolink: true, defaultProtocol: 'https' }),
      ...(single ? [] : [Blockquote, HardBreak]),
      UndoRedo,
      Placeholder.configure({ placeholder: placeholder ?? '' }),
    ],
    content: html || '',
    immediatelyRender: true,
    editorProps: {
      attributes: {
        class: ['editable', 'is-editing', className].filter(Boolean).join(' '),
        role: 'textbox',
        'aria-label': placeholder ?? 'Text',
        ...(single ? {} : { 'aria-multiline': 'true' }),
        spellcheck: 'true',
      },
      handlePaste: (view, event) => pastePlain(view, event, single),
      handleDrop: () => true,
      handleKeyDown: (_view, event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          finish(null, false);
          return true;
        }
        if (event.key === 'Enter' && (single || event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          (document.activeElement as HTMLElement | null)?.blur();
          return true;
        }
        return false;
      },
    },
    onBlur: ({ editor }) => {
      // Focus moving into our own toolbar is not the end of the edit.
      setTimeout(() => {
        if (holdBlur.current) return;
        if (wrap.current?.contains(document.activeElement)) return;
        if (document.activeElement?.closest('.rt-bar')) return;
        finish(editor, true);
      }, 0);
    },
  });

  // Put the caret where the click landed.
  useLayoutEffect(() => {
    if (!editor) return;
    let pos: number | null = null;
    if (clickAt) pos = editor.view.posAtCoords({ left: clickAt.x, top: clickAt.y })?.pos ?? null;
    editor.commands.focus(pos ?? 'end');
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={wrap} className="rt-wrap" style={style}>
      <EditorContent editor={editor} />
      {editor ? (
        <Toolbar
          editor={editor}
          anchor={wrap}
          single={single}
          linkOpen={linkOpen}
          setLinkOpen={(v) => {
            holdBlur.current = v;
            setLinkOpen(v);
          }}
          onDone={() => finish(editor, true)}
        />
      ) : null}
    </div>
  );
}

function Toolbar({
  editor,
  anchor,
  single,
  linkOpen,
  setLinkOpen,
  onDone,
}: {
  editor: Editor;
  anchor: React.RefObject<HTMLDivElement | null>;
  single?: boolean;
  linkOpen: boolean;
  setLinkOpen: (v: boolean) => void;
  onDone: () => void;
}) {
  const [pos, setPos] = useState<CSSProperties>({ visibility: 'hidden' });
  const [url, setUrl] = useState('');
  const [, force] = useState(0);

  useLayoutEffect(() => {
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const top = r.top > 64 ? r.top - 48 : r.bottom + 8;
      setPos({ top, left: Math.max(8, Math.min(r.left, window.innerWidth - 340)) });
    };
    place();
    const update = () => force((n) => n + 1);
    editor.on('selectionUpdate', update);
    editor.on('transaction', update);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      editor.off('selectionUpdate', update);
      editor.off('transaction', update);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [editor, anchor]);

  const keep = (e: React.MouseEvent | React.PointerEvent) => e.preventDefault();
  const btn = (label: string, active: boolean, run: () => void, title: string, cls = '') => (
    <button
      type="button"
      className={['rt-bar__btn', active && 'is-on', cls].filter(Boolean).join(' ')}
      aria-pressed={active}
      title={title}
      aria-label={title}
      onMouseDown={keep}
      onPointerDown={keep}
      onClick={run}
    >
      {label}
    </button>
  );

  const applyLink = () => {
    const href = url.trim();
    const chain = editor.chain().focus().extendMarkRange('link');
    if (!href) chain.unsetLink().run();
    else chain.setLink({ href: /^(https?:|mailto:)/i.test(href) ? href : `https://${href}` }).run();
    setLinkOpen(false);
  };

  return createPortal(
    <div className="rt-bar" style={pos} role="toolbar" aria-label="Text formatting">
      {linkOpen ? (
        <form
          className="rt-bar__link"
          onSubmit={(e) => {
            e.preventDefault();
            applyLink();
          }}
        >
          <input
            autoFocus
            type="url"
            inputMode="url"
            placeholder="Paste a link"
            aria-label="Link address"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                setLinkOpen(false);
                editor.commands.focus();
              }
            }}
          />
          <button type="submit" className="rt-bar__btn">
            Set
          </button>
        </form>
      ) : (
        <>
          {btn('B', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), 'Bold', 'rt-bar__b')}
          {btn('I', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), 'Italic', 'rt-bar__i')}
          {btn(
            'Link',
            editor.isActive('link'),
            () => {
              setUrl(editor.getAttributes('link').href ?? '');
              setLinkOpen(true);
            },
            'Link',
          )}
          {!single
            ? btn('“ Pull quote', editor.isActive('blockquote'), () => editor.chain().focus().toggleBlockquote().run(), 'Pull quote')
            : null}
          <span className="rt-bar__sep" aria-hidden="true" />
          {btn('Done', false, onDone, 'Done editing', 'rt-bar__done')}
        </>
      )}
    </div>,
    document.body,
  );
}
