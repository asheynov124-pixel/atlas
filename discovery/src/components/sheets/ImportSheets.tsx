/**
 * Personal Import: the import sheet (paste / clipboard / drop / upload →
 * live preview → import), the post-import screen, the bulk title editor, and
 * the per-item metadata editor.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sheet, MenuItem } from '../Sheet';
import { Chip, Toggle } from '../common';
import { VideoTile } from '../Thumb';
import { useUI } from '../../state/ui';
import { useStore, activeData } from '../../state/store';
import { useTaxonomy } from '../../state/taxonomy';
import { startPath } from '../../state/feed';
import { useImportDraft, useDraftView, computeDraft, type ScanState } from '../../import/draft';
import { zeroMediaMessage } from '../../import/scan';
import { itemFromCandidate, matchTagIds, parseTagInput, cleanTags, importSummary } from '../../import/model';
import { textIsSafe } from '../../import/extract';
import { downloadText, exportBatchJSON, exportBatchUrls, exportFilename } from '../../import/exportBatch';
import { applyTitleOp, canRedo, canUndo, historyCommit, historyInit, historyRedo, historyUndo, type TitleOp, type TitleSubject } from '../../import/titles';
import { EDITOR_SHORTCUTS, IMPORT_SHORTCUTS, MOD, fullySelected, isMod, isTyping, type Shortcut } from '../../import/keys';
import { hostOf, mightBeImage } from '../../import/urls';
import type { Candidate, ImportBatch, ImportItem } from '../../import/types';
import { dayLabel, plural, timeAgo } from '../../lib/format';
import { IconCheck, IconDownload, IconExternal, IconLink, IconPencil, IconPlay, IconTrash, IconUndo, IconUpload } from '../Icons';

const FILE_ACCEPT = '.txt,.csv,.tsv,.json,.html,.htm,text/plain,text/csv,application/json,text/html';
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const TYPE_LABEL = { image: 'Image', video: 'Video', page: 'Gallery page' } as const;
const FLAG_LABEL: Record<string, string> = {
  duplicate: 'Duplicate',
  'in-library': 'Already imported',
  small: 'Small',
  'low-confidence': 'Low confidence',
  unscanned: 'Not scanned',
  'scan-failed': 'Couldn’t read',
};
const ORIGIN_LABEL: Record<string, string> = {
  direct: 'Link',
  meta: 'Page cover',
  video: 'Video tag',
  img: 'On page',
  srcset: 'Hi-res',
  lazy: 'Lazy-loaded',
  link: 'Full size',
  jsonld: 'Structured data',
  json: 'Gallery data',
  style: 'Background',
  nav: 'Page',
};

function toast(text: string, tone: 'info' | 'error' | 'save' = 'info') {
  useUI.getState().toast({ text, tone });
}

function useIsTop(kind: string) {
  return useUI((s) => s.sheets[s.sheets.length - 1]?.kind === kind);
}

// ---------------------------------------------------------------------------
// Export

/** Draft rows as exportable items, so a batch can be exported before it's even imported. */
function draftAsBatch(): { batch: Pick<ImportBatch, 'id' | 'name' | 'createdAt' | 'tags'>; items: ImportItem[] } | null {
  const d = useImportDraft.getState();
  const view = computeDraft(d);
  const chosen = view.rows.filter((c) => c.include);
  if (!chosen.length) return null;
  const batch = { id: 'draft', name: d.board.name.trim() || view.defaultName, createdAt: Date.now(), tags: parseTagInput(d.batchTags) };
  return { batch, items: chosen.map((c) => itemFromCandidate(c, batch, { title: d.overrides[c.key]?.title, extraTags: d.overrides[c.key]?.tags })) };
}

function batchItems(batch: ImportBatch, items: Record<string, ImportItem>): ImportItem[] {
  return batch.itemIds.map((id) => items[id]).filter((i): i is ImportItem => !!i);
}

export function exportJSON(batch: Pick<ImportBatch, 'id' | 'name' | 'createdAt' | 'tags'>, items: ImportItem[]) {
  downloadText(exportFilename(batch, 'json'), exportBatchJSON(batch, items), 'application/json');
  toast(`Exported ${plural(items.length, 'item')} as JSON`);
}

function ExportButtons({ batch, items, compact }: { batch: Pick<ImportBatch, 'id' | 'name' | 'createdAt' | 'tags'>; items: ImportItem[]; compact?: boolean }) {
  const urls = () => exportBatchUrls(items);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && typeof File !== 'undefined';
  const share = async () => {
    const file = new File([exportBatchJSON(batch, items)], exportFilename(batch, 'json'), { type: 'application/json' });
    if (!navigator.canShare?.({ files: [file] })) return exportJSON(batch, items);
    try {
      await navigator.share({ files: [file], title: batch.name });
    } catch {
      /* cancelled */
    }
  };
  return (
    <div className={`row row--wrap${compact ? ' export-row--compact' : ''}`}>
      <button type="button" className="btn" onClick={() => exportJSON(batch, items)}>
        <IconDownload size={16} /> JSON
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => {
          downloadText(exportFilename(batch, 'txt'), urls(), 'text/plain');
          toast(`Exported ${plural(items.length, 'URL')}`);
        }}
      >
        <IconDownload size={16} /> URL list
      </button>
      <button
        type="button"
        className="btn btn--ghost"
        onClick={() =>
          void navigator.clipboard?.writeText(urls()).then(
            () => toast(`Copied ${plural(items.length, 'URL')}`),
            () => toast('Couldn’t copy', 'error'),
          )
        }
      >
        <IconLink size={16} /> Copy URLs
      </button>
      {canShare && !compact && (
        <button type="button" className="btn btn--ghost" onClick={() => void share()}>
          Share…
        </button>
      )}
    </div>
  );
}

export function ShortcutHelp({ list, title }: { list: Shortcut[]; title: string }) {
  return (
    <div className="kbd-help" role="note" aria-label={title}>
      <strong>{title}</strong>
      <dl>
        {list.map((s) => (
          <div key={s.keys}>
            <dt>
              {s.keys.split(' ').map((k, i) => (
                <kbd key={i}>{k}</kbd>
              ))}
            </dt>
            <dd>{s.does}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Import sheet

export function ImportSheet({ batchId }: { batchId?: string }) {
  const doneBatchId = useImportDraft((s) => s.doneBatchId);
  const id = batchId ?? doneBatchId;
  const exists = useStore((s) => !!id && activeData(s).imports.batches.some((b) => b.id === id));
  if (id && exists) return <BatchScreen batchId={id} reopened={!!batchId} />;
  return <ImportEditor />;
}

function PreviewThumb({ c, show }: { c: Candidate; show: boolean }) {
  // Try the thumbnail, then the file itself; only a real load error falls back to the icon.
  const probe = c.mediaType === 'page' && c.origin === 'direct' && mightBeImage(c.url);
  const sources = [...new Set([c.thumbnailUrl, c.mediaType === 'image' || probe ? c.url : undefined].filter((u): u is string => !!u))];
  const [failed, setFailed] = useState(0);
  const src = sources[failed];
  if (!show || !src) {
    return (
      <span className={`ipreview__thumb ipreview__thumb--ph ipreview__thumb--${c.mediaType}`} aria-hidden="true">
        {c.mediaType === 'image' ? '▧' : c.mediaType === 'video' ? '▶' : '↗'}
      </span>
    );
  }
  return (
    <span className="ipreview__thumb">
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        draggable={false}
        onLoad={(e) => {
          // An extension-less link that loads as a picture is a picture: say so.
          if (probe && src === c.url && e.currentTarget.naturalWidth > 0) useImportDraft.getState().markMedia(c.url, 'image');
        }}
        onError={() => setFailed((n) => n + 1)}
      />
      {c.mediaType === 'video' && <span className="ipreview__play">▶</span>}
    </span>
  );
}

/** "I have direct links": how to get them, and what they look like. */
function DirectLinksTip({ open }: { open: boolean }) {
  return (
    <details className="direct-tip" open={open}>
      <summary>I have direct links</summary>
      <p>
        Links straight to the picture or video file import instantly, one per line, mixed freely with gallery pages. Each link is handled on its own:
      </p>
      <pre className="direct-tip__example" aria-label="Example of direct links">
        {'https://cdn.example.com/photos/beach-01.jpg\nhttps://cdn.example.com/photos/beach-02.webp\nhttps://media.example.net/clips/waves.mp4\nhttps://www.example.org/galleries/summer-set/'}
      </pre>
      <p className="small">
        To get one: on a computer, right-click a picture → <b>Copy Image Address</b>. On iPhone, touch and hold a picture → <b>Open in New Tab</b>, then copy the
        address from the address bar.
      </p>
    </details>
  );
}

/** Under a gallery-page row: what happened when it was read, and the way out (open it, copy links). */
function PageRowStatus({ c, scan }: { c: Candidate; scan?: ScanState }) {
  const failed = c.flags.includes('scan-failed');
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <span className={`ipage${failed ? ' ipage--failed' : ''}`} onClick={stop} onDoubleClick={stop}>
      {failed ? (
        <span className="ipage__msg" role="status">
          {zeroMediaMessage(c.error)}
        </span>
      ) : scan?.status === 'ok' && scan.found > 0 ? (
        <span className="ipage__msg">
          {plural(scan.found, 'item')} found{scan.cached ? ' · read earlier this session' : ''} — listed below.
        </span>
      ) : scan?.status === 'running' ? (
        <span className="ipage__msg">Reading…</span>
      ) : null}
      <span className="row row--wrap ipage__actions">
        <a className="btn btn--small" href={c.url} target="_blank" rel="noopener noreferrer" aria-label={`Open page ${hostOf(c.url)}`}>
          Open page <IconExternal size={14} />
        </a>
        {scan && scan.status !== 'running' && (
          <button type="button" className="btn btn--small btn--ghost" onClick={() => void useImportDraft.getState().scan([c.url], { fresh: true })}>
            Read again
          </button>
        )}
      </span>
    </span>
  );
}

function ImportEditor() {
  const close = useUI((s) => s.closeSheet);
  const openSheet = useUI((s) => s.openSheet);
  const d = useImportDraft();
  const view = useDraftView();
  const incognito = useStore((s) => s.incognito);
  const dataSaver = useStore((s) => s.settings.dataSaver);
  const [showThumbs, setShowThumbs] = useState(!dataSaver);
  const [help, setHelp] = useState(false);
  const [over, setOver] = useState(false);
  const [tagging, setTagging] = useState(false);
  // Long imports render progressively; every row is still included and selectable via ⌘A.
  const [shown, setShown] = useState(300);
  const [tagText, setTagText] = useState('');
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const isTop = useIsTop('import');
  const selected = useMemo(() => new Set(d.selected), [d.selected]);
  const rows = view.rows;
  const included = rows.filter((c) => c.include);
  const pending = view.unscannedPages;
  const failed = rows.filter((c) => c.flags.includes('scan-failed'));
  const directCount = rows.filter((c) => c.include && c.mediaType !== 'page').length;
  const hasInput = !!d.text.trim() || d.files.length > 0;

  const readFiles = useCallback(async (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      if (f.size > MAX_FILE_BYTES) {
        toast(`${f.name} is too large (8 MB max)`, 'error');
        continue;
      }
      if (!/\.(txt|csv|tsv|json|html?|md|list)$/i.test(f.name) && !/^(text\/|application\/json)/.test(f.type)) {
        toast(`${f.name}: use .txt, .csv, .json, or a saved .html page`, 'error');
        continue;
      }
      try {
        const src = useImportDraft.getState().addFile(f.name, await f.text());
        toast(src.candidates.length ? `Read ${plural(src.candidates.length, 'link')} from ${f.name}` : `No links found in ${f.name}`, src.candidates.length ? 'info' : 'error');
      } catch {
        toast(`Couldn’t read ${f.name}`, 'error');
      }
    }
  }, []);

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) return toast('The clipboard is empty', 'error');
      useImportDraft.getState().appendText(text);
    } catch {
      textRef.current?.focus();
      toast('Clipboard access was blocked — long-press the box and choose Paste', 'error');
    }
  };

  const doCommit = () => {
    const r = useImportDraft.getState().commit();
    if (!r.ok) {
      return toast(
        r.reason === 'empty'
          ? 'Nothing selected to import'
          : r.reason === 'unsafe-name'
            ? 'That name or those tags aren’t allowed. Only content with consenting adults can be imported.'
            : 'Those items were refused by the safety rules.',
        'error',
      );
    }
    useUI.getState().toast({ text: `Imported ${plural(r.count, 'clip')}${r.refused ? ` · ${r.refused} refused by the safety rules` : ''}`, tone: 'save' });
  };
  const primary = () => {
    if (d.scanning) return;
    if (pending.length) void useImportDraft.getState().scan(pending);
    else doCommit();
  };
  const exportDraft = () => {
    const x = draftAsBatch();
    if (!x) return toast('Nothing included to export yet', 'error');
    exportJSON(x.batch, x.items);
  };
  const openEditor = () => {
    if (!included.length) return toast(rows.length ? 'Include something first' : 'Paste some links first', 'error');
    openSheet({ kind: 'bulk-titles', target: 'draft' });
  };

  const selectRow = (c: Candidate, e: React.MouseEvent | React.KeyboardEvent) => {
    const st = useImportDraft.getState();
    if (e.shiftKey && st.anchor) {
      const a = rows.findIndex((r) => r.key === st.anchor);
      const b = rows.findIndex((r) => r.key === c.key);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      st.setSelected(rows.slice(lo, hi + 1).map((r) => r.key));
    } else if (e.metaKey || e.ctrlKey) {
      st.setSelected(selected.has(c.key) ? d.selected.filter((k) => k !== c.key) : [...d.selected, c.key], c.key);
    } else st.setSelected(selected.has(c.key) && d.selected.length === 1 ? [] : [c.key], c.key);
  };
  const setInclude = (keys: string[], include: boolean) => {
    const locked = new Set(rows.filter((r) => r.flags.includes('in-library')).map((r) => r.key));
    const ks = keys.filter((k) => !locked.has(k));
    if (ks.length) useImportDraft.getState().setOverride(ks, { include });
  };

  // Paste anywhere in the sheet lands in the box (text and files).
  useEffect(() => {
    if (!isTop) return;
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target)) return;
      const files = e.clipboardData?.files;
      if (files?.length) {
        e.preventDefault();
        void readFiles(files);
        return;
      }
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (text.trim()) {
        e.preventDefault();
        useImportDraft.getState().appendText(text);
        textRef.current?.focus();
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [isTop, readFiles]);

  // Shortcuts while this sheet is on top.
  useEffect(() => {
    if (!isTop) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = isTyping(e.target);
      const k = e.key.toLowerCase();
      if (e.repeat && isMod(e)) return; // a held ⌘↵ must not import and then swipe
      if (isMod(e) && k === 'enter') {
        e.preventDefault();
        primary();
      } else if (isMod(e) && e.shiftKey && k === 'e') {
        e.preventDefault();
        exportDraft();
      } else if (isMod(e) && k === 'e') {
        e.preventDefault();
        openEditor();
      } else if (isMod(e) && k === 's') {
        e.preventDefault(); // never the browser's "Save page"
        toast('Titles save as you edit here — use the title editor (⌘E) for bulk changes');
      } else if (isMod(e) && k === 'a' && !typing) {
        e.preventDefault();
        useImportDraft.getState().setSelected(rows.map((r) => r.key), rows[0]?.key ?? null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && d.selected.length) {
        e.preventDefault();
        setInclude(d.selected, false);
        toast(`Excluded ${plural(d.selected.length, 'item')}`);
      } else if (e.key === '?' && !typing) {
        e.preventDefault();
        setHelp((v) => !v);
      } else if (isMod(e) && k === 'v' && !typing) {
        textRef.current?.focus(); // the paste event that follows lands in the box
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const s = view.summary;
  const dropped = s.dropped.junk + s.dropped.ads;
  const primaryLabel = d.scanning
    ? `Scanning ${d.scanning.done}/${d.scanning.total}…`
    : pending.length
      ? `Find media in ${plural(pending.length, 'page')}`
      : `Import ${included.length || ''}`.trim();

  return (
    <Sheet
      onClose={close}
      title="Import"
      subtitle="Links become swipeable clips. Everything stays on this device."
      tall
      className="import-sheet"
      footer={
        <div className="row row--split import-foot">
          <button type="button" className="btn btn--ghost" onClick={() => useImportDraft.getState().clear()} disabled={!hasInput && !rows.length}>
            Clear
          </button>
          <button type="button" className="btn btn--primary" onClick={primary} disabled={!!d.scanning || (!pending.length && !included.length)} title={`${MOD} ↵`}>
            {primaryLabel}
          </button>
        </div>
      }
    >
      {incognito && (
        <div className="notice notice--warn" role="status">
          Incognito is on: this import works now but disappears when you turn incognito off.
        </div>
      )}
      <div
        className={`dropzone${over ? ' dropzone--over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (e.dataTransfer.files.length) void readFiles(e.dataTransfer.files);
          else {
            const text = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
            if (text) useImportDraft.getState().appendText(text.split('\n').filter((l) => !l.startsWith('#')).join('\n'));
          }
        }}
      >
        <textarea
          ref={textRef}
          className="dropzone__text"
          aria-label="Links to import"
          placeholder={'Paste links: images, videos, or gallery pages.\nOne per line, a whole list, or an exported batch.'}
          value={d.text}
          rows={4}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          onChange={(e) => d.setText(e.target.value)}
        />
        <div className="row row--wrap dropzone__actions">
          <button type="button" className="btn btn--small" onClick={() => void pasteFromClipboard()}>
            <IconLink size={15} /> Paste from clipboard
          </button>
          <button type="button" className="btn btn--small" onClick={() => fileRef.current?.click()}>
            <IconUpload size={15} /> Upload file
          </button>
          <input
            ref={fileRef}
            type="file"
            hidden
            multiple
            accept={FILE_ACCEPT}
            aria-label="Upload a .txt, .csv, .json, or .html file"
            onChange={(e) => {
              if (e.target.files) void readFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <button type="button" className={`icon-btn icon-btn--small kbd-toggle${help ? ' kbd-toggle--on' : ''}`} aria-label="Keyboard shortcuts" aria-expanded={help} onClick={() => setHelp((v) => !v)}>
            ?
          </button>
        </div>
        <p className="dropzone__hint">…or drop files and links here: .txt, .csv, .json, or a saved .html page.</p>
        {d.files.length > 0 && (
          <div className="chips">
            {d.files.map((f) => (
              <Chip key={f.id} onRemove={() => d.removeFile(f.id)} title={`${f.kind.toUpperCase()} · ${f.candidates.length} links`}>
                📄 {f.label} · {f.candidates.length}
              </Chip>
            ))}
          </div>
        )}
      </div>
      {help && <ShortcutHelp list={IMPORT_SHORTCUTS} title="Import shortcuts" />}

      {!rows.length && hasInput && !d.scanning && (
        <div className="notice" role="status">
          {s.dropped.refused
            ? `${plural(s.dropped.refused, 'item')} refused by the safety rules. Only content with consenting adults can be imported.`
            : s.dropped.invalid
              ? `${plural(s.dropped.invalid, 'line')} didn’t contain a usable http(s) link.`
              : 'No links found yet. Paste URLs (https://…) or upload a list.'}
        </div>
      )}
      {!rows.length && !hasInput && (
        <ul className="import-tips">
          <li>
            <b>Direct files</b> (.jpg .png .webp .gif .avif .mp4 .webm .mov…) import instantly.
          </li>
          <li>
            <b>Gallery pages</b> are read once, on request, from this device — when the site allows it (CORS). If it doesn’t, save the page and upload the .html.
          </li>
          <li>
            <b>Exports re-import</b>: drop a batch’s .json here to bring it back with titles and tags.
          </li>
        </ul>
      )}
      <DirectLinksTip open={failed.length > 0 || (!rows.length && !hasInput)} />

      {rows.length > 0 && (
        <section className="ipreview" aria-label="Import preview">
          <div className="ipreview__summary" role="status">
            <b>{plural(s.total, 'item')}</b>
            {s.images > 0 && <span>{plural(s.images, 'image')}</span>}
            {s.videos > 0 && <span>{plural(s.videos, 'video')}</span>}
            {s.pages > 0 && <span>{plural(s.pages, 'page')}</span>}
            {s.duplicates > 0 && <span>{plural(s.duplicates, 'duplicate')} merged</span>}
            {s.inLibrary > 0 && <span>{s.inLibrary} already imported</span>}
            {dropped > 0 && <span>{dropped} icons/ads skipped</span>}
            {s.dropped.refused > 0 && <span className="neg">{s.dropped.refused} refused (safety)</span>}
            {s.dropped.overflow > 0 && <span className="neg">{s.dropped.overflow} over the 2,000-item limit</span>}
            {s.dropped.invalid > 0 && <span>{s.dropped.invalid} unusable</span>}
          </div>

          {d.scanning && (
            <div className="scanbar" role="progressbar" aria-valuemin={0} aria-valuemax={d.scanning.total} aria-valuenow={d.scanning.done}>
              <span>
                Reading {d.scanning.done}/{d.scanning.total} pages…
              </span>
              <div className="scanbar__track">
                <div className="scanbar__fill" style={{ width: `${(100 * d.scanning.done) / Math.max(1, d.scanning.total)}%` }} />
              </div>
              <button type="button" className="link" onClick={() => d.cancelScan()}>
                Cancel
              </button>
            </div>
          )}
          {!d.scanning && pending.length > 0 && (
            <div className="notice">
              {plural(pending.length, 'gallery page')}. “Find media” reads each page once from this device, and only if the site allows other apps to (CORS).
              {directCount > 0 && (
                <div className="row row--wrap notice__actions">
                  <button type="button" className="btn btn--small btn--ghost" onClick={() => d.skipUnscannedPages()}>
                    Skip the pages · import the {plural(directCount, 'direct link')} only
                  </button>
                </div>
              )}
            </div>
          )}
          {failed.length > 0 && !d.scanning && (
            <details className="notice notice--warn scanfail">
              <summary>
                {plural(failed.length, 'gallery page')} gave no images. {failed.length === 1 ? 'It’s' : 'They’re'} left unticked; tick to keep as an open-original bookmark.
              </summary>
              <ul>
                {failed.map((c) => (
                  <li key={c.key}>
                    <b>{hostOf(c.url)}</b>: {c.error?.message ?? 'Unknown error'}
                  </li>
                ))}
              </ul>
              <p className="small">Tip: open the page, save it (Share → Save to Files, or {MOD} S on a computer), then upload the .html here.</p>
            </details>
          )}
          {view.nav.length > 0 && !d.scanning && (
            <div className="row row--wrap">
              {view.nav.some((n) => n.role === 'next') && (
                <button type="button" className="btn btn--small" onClick={() => void d.scan(view.nav.filter((n) => n.role === 'next').map((n) => n.url))}>
                  Scan next page ›
                </button>
              )}
              {view.nav.some((n) => n.role === 'subpage') && (
                <button type="button" className="btn btn--small" onClick={() => void d.scan(view.nav.filter((n) => n.role === 'subpage').map((n) => n.url).slice(0, 24))}>
                  Scan {plural(Math.min(24, view.nav.filter((n) => n.role === 'subpage').length), 'linked gallery page')}
                </button>
              )}
            </div>
          )}

          <div className="ipreview__bar">
            <label className="ipreview__all">
              <input
                type="checkbox"
                checked={included.length === rows.filter((r) => !r.flags.includes('in-library')).length && included.length > 0}
                onChange={(e) => setInclude(rows.map((r) => r.key), e.target.checked)}
                aria-label="Include all"
              />
              <span>
                {included.length}/{rows.length} included
                {d.selected.length > 0 && ` · ${d.selected.length} selected`}
              </span>
            </label>
            <div className="row row--wrap ipreview__actions">
              {d.selected.length > 0 && (
                <>
                  <button type="button" className="btn btn--small" onClick={() => setInclude(d.selected, true)}>
                    Include
                  </button>
                  <button type="button" className="btn btn--small" onClick={() => setInclude(d.selected, false)} title="⌫">
                    Exclude
                  </button>
                  <button type="button" className="btn btn--small" onClick={() => setTagging((v) => !v)}>
                    Tag…
                  </button>
                </>
              )}
              <button type="button" className="btn btn--small" onClick={openEditor} title={`${MOD} E`}>
                <IconPencil size={14} /> Edit titles
              </button>
              {!showThumbs && (
                <button type="button" className="btn btn--small btn--ghost" onClick={() => setShowThumbs(true)}>
                  Load previews
                </button>
              )}
            </div>
          </div>
          {tagging && d.selected.length > 0 && (
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                const tags = parseTagInput(tagText);
                if (!tags.length) return;
                if (!textIsSafe(tags)) return toast('Those tags aren’t allowed', 'error');
                for (const k of d.selected) {
                  const cur = d.overrides[k]?.tags ?? [];
                  useImportDraft.getState().setOverride([k], { tags: cleanTags([...cur, ...tags]) });
                }
                toast(`Tagged ${plural(d.selected.length, 'item')}`);
                setTagText('');
                setTagging(false);
              }}
            >
              <input autoFocus value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="Tags for the selected items" aria-label="Tags for the selected items" />
              <button className="btn" type="submit">
                Add
              </button>
            </form>
          )}

          <ul className="ipreview__list" ref={listRef} role="listbox" aria-multiselectable="true" aria-label="Items found">
            {rows.slice(0, shown).map((c) => {
              const locked = c.flags.includes('in-library');
              const tags = d.overrides[c.key]?.tags ?? [];
              return (
                <li
                  key={c.key}
                  role="option"
                  aria-selected={selected.has(c.key)}
                  className={`ipreview__row${selected.has(c.key) ? ' ipreview__row--sel' : ''}${c.include ? '' : ' ipreview__row--out'}`}
                  onClick={(e) => selectRow(c, e)}
                  onDoubleClick={() => openSheet({ kind: 'bulk-titles', target: 'draft', focus: c.key })}
                >
                  <input
                    type="checkbox"
                    checked={c.include}
                    disabled={locked}
                    aria-label={`Include ${c.title}`}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setInclude([c.key], e.target.checked)}
                  />
                  <PreviewThumb c={c} show={showThumbs} />
                  <span className="ipreview__text">
                    <span className="ipreview__title">{c.title}</span>
                    <span className="ipreview__meta">
                      <span className={`ibadge ibadge--${c.mediaType}`}>{TYPE_LABEL[c.mediaType]}</span>
                      <span className="ibadge ibadge--muted">{ORIGIN_LABEL[c.origin] ?? c.origin}</span>
                      {c.flags.map((f) => (
                        <span key={f} className={`ibadge ibadge--flag ibadge--${f}`}>
                          {FLAG_LABEL[f] ?? f}
                        </span>
                      ))}
                      {c.width && c.height ? <span className="ipreview__dim">{c.width}×{c.height}</span> : null}
                      <span className="ipreview__host">{hostOf(c.originalUrl || c.url)}</span>
                      {tags.map((t) => (
                        <span key={t} className="ipreview__tag">
                          #{t}
                        </span>
                      ))}
                    </span>
                    {c.mediaType === 'page' && <PageRowStatus c={c} scan={d.scans[c.url]} />}
                  </span>
                </li>
              );
            })}
          </ul>
          {rows.length > shown && (
            <button type="button" className="btn btn--ghost btn--block" onClick={() => setShown((n) => n + 500)}>
              Show {Math.min(500, rows.length - shown)} more of {rows.length - shown} (all included as marked)
            </button>
          )}

          <div className="ibatch">
            <label className="field">
              <span>Tags for this import</span>
              <input value={d.batchTags} onChange={(e) => d.setBatchTags(e.target.value)} placeholder="e.g. beach, golden hour" aria-label="Tags for this import" />
            </label>
            {view.suggestions.length > 0 && (
              <div className="chips" aria-label="Suggested tags">
                {view.suggestions.map((t) => (
                  <Chip key={t} tone="muted" onClick={() => d.setBatchTags(d.batchTags.trim() ? `${d.batchTags.replace(/[,\s]+$/, '')}, ${t}` : t)}>
                    + {t}
                  </Chip>
                ))}
              </div>
            )}
            <Toggle checked={d.board.on} onChange={(on) => d.setBoard({ on })} label="Create a board from this import" hint="Also lists it in Library → Imports" />
            <label className="field">
              <span>{d.board.on ? 'Board & import name' : 'Import name'}</span>
              <input value={d.board.name} onChange={(e) => d.setBoard({ name: e.target.value, touched: true })} placeholder={view.defaultName} aria-label="Import name" />
            </label>
          </div>
        </section>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Post-import / reopened batch

function BatchScreen({ batchId, reopened }: { batchId: string; reopened: boolean }) {
  const close = useUI((s) => s.closeSheet);
  const openSheet = useUI((s) => s.openSheet);
  const batch = useStore((s) => activeData(s).imports.batches.find((b) => b.id === batchId));
  const allItems = useStore((s) => activeData(s).imports.items);
  const board = useStore((s) => activeData(s).boards.find((b) => b.id === batch?.boardId));
  const renameImportBatch = useStore((s) => s.renameImportBatch);
  const deleteImportBatch = useStore((s) => s.deleteImportBatch);
  const [confirm, setConfirm] = useState(false);
  const [name, setName] = useState(batch?.name ?? '');
  const isTop = useIsTop('import');
  const items = useMemo(() => (batch ? batchItems(batch, allItems) : []), [batch, allItems]);
  const nameRef = useRef(name);
  nameRef.current = name;
  const saveName = () => {
    const v = nameRef.current.trim();
    if (!batch || !v || v === batch.name) return;
    if (!renameImportBatch(batch.id, v)) {
      toast('That name isn’t allowed', 'error');
      setName(batch.name);
    }
  };
  // A name typed just before closing (Escape, ⌘↵) still saves.
  const saveRef = useRef(saveName);
  saveRef.current = saveName;
  useEffect(() => () => saveRef.current(), []);

  const swipe = () => {
    if (!batch) return;
    startPath({ kind: 'imported', batchId: batch.id, label: batch.name }, { show: true });
    useUI.getState().closeAllSheets();
  };
  const more = () => {
    useImportDraft.getState().showBatch(null);
    if (reopened) openSheet({ kind: 'import' });
  };

  useEffect(() => {
    if (!isTop || !batch) return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (e.repeat && isMod(e)) return;
      if (isMod(e) && e.shiftKey && k === 'e') {
        e.preventDefault();
        exportJSON(batch, items);
      } else if (isMod(e) && k === 'e') {
        e.preventDefault();
        openSheet({ kind: 'bulk-titles', target: { batchId: batch.id } });
      } else if (isMod(e) && k === 'enter') {
        e.preventDefault();
        swipe();
      } else if (isMod(e) && k === 's') e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!batch) return null;
  const st = batch.stats;
  const notes: string[] = [];
  if (st.duplicates) notes.push(`${plural(st.duplicates, 'duplicate')} skipped`);
  if (st.failed) notes.push(`${plural(st.failed, 'page')} couldn’t be read and will open the original`);
  if (st.dropped) notes.push(`${st.dropped} icons, ads, or refused items left out`);

  return (
    <Sheet
      onClose={close}
      title={reopened ? batch.name : `Imported ${plural(items.length, 'clip')}`}
      subtitle={`${reopened ? `${plural(items.length, 'clip')} · ` : ''}${dayLabel(batch.createdAt)} · ${timeAgo(batch.createdAt)}${batch.tags.length ? ` · #${batch.tags.join(' #')}` : ''}`}
      tall
      className="import-sheet"
      footer={
        <div className="row row--split import-foot">
          <button type="button" className="btn btn--ghost" onClick={more}>
            Import more
          </button>
          <button type="button" className="btn btn--primary" onClick={swipe} title={`${MOD} ↵`}>
            <IconPlay size={16} /> Swipe imported now
          </button>
        </div>
      }
    >
      {!reopened && (
        <div className="notice notice--ok" role="status">
          <IconCheck size={16} /> {plural(items.length, 'clip')} added{board ? ` to “${board.name}”` : ''}. {notes.join(' · ')}
        </div>
      )}
      {reopened && notes.length > 0 && <p className="muted small">{notes.join(' · ')}</p>}
      <label className="field">
        <span>Name</span>
        <input
          value={name}
          aria-label="Batch name"
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        />
      </label>
      <div className="row row--wrap">
        <button type="button" className="btn" onClick={() => openSheet({ kind: 'bulk-titles', target: { batchId: batch.id } })} title={`${MOD} E`}>
          <IconPencil size={16} /> Edit titles
        </button>
        {board && (
          <button type="button" className="btn" onClick={() => openSheet({ kind: 'board', boardId: board.id })}>
            {board.emoji} Board
          </button>
        )}
      </div>
      <div className="field">
        <span>Export this batch ({MOD} ⇧ E)</span>
        <ExportButtons batch={batch} items={items} />
      </div>
      <div className="grid grid--compact">
        {items.slice(0, 60).map((it) => (
          <VideoTile
            key={it.id}
            video={importSummary(it)}
            onOpen={() => {
              startPath({ kind: 'imported', batchId: batch.id, label: batch.name }, { show: true, startWith: [it.id] });
              useUI.getState().closeAllSheets();
            }}
            onLongPress={() => openSheet({ kind: 'edit-import', videoId: it.id })}
            meta={it.tags.length ? `#${it.tags.slice(0, 2).join(' #')}` : TYPE_LABEL[it.mediaType]}
          />
        ))}
      </div>
      {items.length > 60 && <p className="muted small">…and {items.length - 60} more.</p>}
      <div className="danger-zone">
        {confirm ? (
          <div className="confirm">
            <span>Delete this import? Its clips leave your saves, boards, history, and learning.</span>
            <div className="row">
              <button type="button" className="btn btn--danger" onClick={() => { deleteImportBatch(batch.id); useImportDraft.getState().showBatch(null); close(); toast('Import deleted'); }}>
                Delete
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setConfirm(false)}>
                Keep
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn btn--ghost btn--danger-text" onClick={() => setConfirm(true)}>
            <IconTrash size={16} /> Delete this import
          </button>
        )}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Bulk title editor

type Tool = 'prefix' | 'suffix' | 'replace';

export function BulkTitleSheet({ target, focus }: { target: 'draft' | { batchId: string }; focus?: string }) {
  const close = useUI((s) => s.closeSheet);
  const isTop = useIsTop('bulk-titles');
  const batchId = target === 'draft' ? null : target.batchId;
  const updateImports = useStore((s) => s.updateImports);
  // Subjects are captured once: the editor works on a stable list.
  const [subjects] = useState<TitleSubject[]>(() => {
    if (!batchId) {
      // What's about to be imported (excluded rows keep their titles until re-included).
      return computeDraft(useImportDraft.getState())
        .rows.filter((c) => c.include)
        .map((c) => ({ id: c.key, title: c.title, url: c.url, originalUrl: c.originalUrl }));
    }
    const d = activeData(useStore.getState());
    const b = d.imports.batches.find((x) => x.id === batchId);
    return b ? batchItems(b, d.imports.items).map((i) => ({ id: i.id, title: i.title, url: i.url, originalUrl: i.originalUrl })) : [];
  });
  const initial = useMemo(() => Object.fromEntries(subjects.map((s) => [s.id, s.title])), [subjects]);
  const [h, setH] = useState(() => historyInit(initial));
  const [sel, setSel] = useState<Set<string>>(() => new Set(batchId ? [] : useImportDraft.getState().selected.filter((k) => initial[k] !== undefined)));
  // The anchor lives in a ref: focus moves during ⇧↑/↓ must not drag it along.
  const anchorRef = useRef(0);
  const extending = useRef(false);
  const [tool, setTool] = useState<Tool>('prefix');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [regex, setRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const changed = subjects.filter((s) => h.present[s.id] !== initial[s.id]).length;
  const scope = sel.size ? sel : null;

  useEffect(() => {
    const i = focus ? subjects.findIndex((s) => s.id === focus) : 0;
    const id = subjects[Math.max(0, i)]?.id;
    if (id) requestAnimationFrame(() => inputs.current.get(id)?.focus());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apply = (op: TitleOp) => {
    try {
      setError(null);
      const next = applyTitleOp(subjects, h.present, op, scope);
      setH((prev) => historyCommit(prev, next));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const save = () => {
    // Blank titles fall back to what they were; whitespace is tidied.
    const clean = (id: string) => (h.present[id] ?? '').replace(/\s+/g, ' ').trim() || initial[id];
    const patches = subjects.filter((s) => clean(s.id) !== initial[s.id]);
    const unsafe = patches.filter((s) => !textIsSafe(clean(s.id)));
    const ok = patches.filter((s) => !unsafe.includes(s));
    let refused = unsafe.length;
    if (batchId) refused += updateImports(Object.fromEntries(ok.map((s) => [s.id, { title: clean(s.id) }])));
    else for (const s of ok) useImportDraft.getState().setOverride([s.id], { title: clean(s.id) });
    const saved = ok.length - (refused - unsafe.length);
    if (saved) toast(`Saved ${plural(saved, 'title')}${refused ? ` · ${refused} refused by the safety rules` : ''}`, 'save');
    else if (refused) toast(`${plural(refused, 'title')} refused by the safety rules`, 'error');
    close();
  };
  const tryClose = () => {
    if (changed && !window.confirm(`Discard ${plural(changed, 'title change')}?`)) return;
    close();
  };

  const focusRow = (i: number) => {
    const s = subjects[Math.max(0, Math.min(subjects.length - 1, i))];
    if (s) inputs.current.get(s.id)?.focus();
    return Math.max(0, Math.min(subjects.length - 1, i));
  };
  const rowIndexOf = (el: EventTarget | null) => subjects.findIndex((s) => inputs.current.get(s.id) === el);

  useEffect(() => {
    if (!isTop) return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      // Undo/redo is the title history in a title field (or nowhere editable); the tool inputs keep native undo.
      const titleHistory = rowIndexOf(e.target) >= 0 || !isTyping(e.target);
      if (isMod(e) && k === 'z' && titleHistory) {
        e.preventDefault();
        setH((prev) => (e.shiftKey ? historyRedo(prev) : historyUndo(prev)));
      } else if (isMod(e) && k === 'y' && titleHistory) {
        e.preventDefault();
        setH(historyRedo);
      } else if (isMod(e) && k === 's') {
        e.preventDefault();
        save();
      } else if (isMod(e) && k === 'a') {
        const inRow = rowIndexOf(e.target) >= 0;
        if (isTyping(e.target) && !(inRow && fullySelected(e.target))) return; // first ⌘A selects the text
        e.preventDefault();
        setSel(new Set(subjects.map((s) => s.id)));
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const i = rowIndexOf(e.target);
        if (i < 0) return;
        e.preventDefault();
        extending.current = e.shiftKey;
        const j = focusRow(i + (e.key === 'ArrowDown' ? 1 : -1));
        extending.current = false;
        if (e.shiftKey) {
          const a = anchorRef.current;
          const [lo, hi] = a < j ? [a, j] : [j, a];
          setSel(new Set(subjects.slice(lo, hi + 1).map((s) => s.id)));
        } else anchorRef.current = j;
      } else if (e.key === '?' && !isTyping(e.target)) {
        e.preventDefault();
        setHelp((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <Sheet
      onClose={tryClose}
      title="Edit titles"
      subtitle={`${plural(subjects.length, 'item')} · ${sel.size ? `${sel.size} selected` : 'tools apply to all'}${changed ? ` · ${changed} changed` : ''}`}
      tall
      className="bulk-sheet"
      footer={
        <div className="row row--split">
          <div className="row">
            <button type="button" className="icon-btn icon-btn--small" aria-label="Undo" disabled={!canUndo(h)} onClick={() => setH(historyUndo)} title={`${MOD} Z`}>
              <IconUndo size={18} />
            </button>
            <button type="button" className="icon-btn icon-btn--small icon-btn--flip" aria-label="Redo" disabled={!canRedo(h)} onClick={() => setH(historyRedo)} title={`${MOD} ⇧ Z`}>
              <IconUndo size={18} />
            </button>
          </div>
          <button type="button" className="btn btn--primary" onClick={save} title={`${MOD} S`}>
            Save titles
          </button>
        </div>
      }
    >
      <div className="bulk-tools">
        <div className="segmented segmented--small" role="tablist" aria-label="Pattern">
          {(['prefix', 'suffix', 'replace'] as Tool[]).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tool === t} className={`segmented__item${tool === t ? ' segmented__item--on' : ''}`} onClick={() => setTool(t)}>
              {t === 'prefix' ? 'Prefix' : t === 'suffix' ? 'Suffix' : 'Find & replace'}
            </button>
          ))}
        </div>
        <form
          className="bulk-tools__form"
          onSubmit={(e) => {
            e.preventDefault();
            if (tool === 'prefix' && a) apply({ kind: 'prefix', text: a });
            else if (tool === 'suffix' && a) apply({ kind: 'suffix', text: a });
            else if (tool === 'replace' && a) apply({ kind: 'replace', find: a, replace: b, regex, caseSensitive });
          }}
        >
          <input value={a} onChange={(e) => setA(e.target.value)} placeholder={tool === 'replace' ? 'Find' : tool === 'prefix' ? 'Text to add before' : 'Text to add after'} aria-label={tool === 'replace' ? 'Find' : tool === 'prefix' ? 'Prefix text' : 'Suffix text'} />
          {tool === 'replace' && <input value={b} onChange={(e) => setB(e.target.value)} placeholder="Replace with" aria-label="Replace with" />}
          <button type="submit" className="btn btn--small" disabled={!a}>
            Apply{scope ? ` to ${sel.size}` : ''}
          </button>
          {tool === 'replace' && (
            <div className="row row--wrap bulk-tools__opts">
              <label className="check">
                <input type="checkbox" checked={regex} onChange={(e) => setRegex(e.target.checked)} /> Regex
              </label>
              <label className="check">
                <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} /> Match case
              </label>
            </div>
          )}
        </form>
        {error && <p className="neg small" role="alert">{error}</p>}
        <div className="chips">
          <Chip onClick={() => apply({ kind: 'capitalize' })}>Capitalize</Chip>
          <Chip onClick={() => apply({ kind: 'titleCase' })}>Title Case</Chip>
          <Chip onClick={() => apply({ kind: 'filename' })}>Use file name</Chip>
          <Chip onClick={() => apply({ kind: 'hostNumber' })}>Hostname – #</Chip>
          <Chip tone="muted" onClick={() => setHelp((v) => !v)}>
            ? Keys
          </Chip>
        </div>
        {help && <ShortcutHelp list={EDITOR_SHORTCUTS} title="Editor shortcuts" />}
      </div>
      <div className="bulk-head">
        <label className="ipreview__all">
          <input
            type="checkbox"
            tabIndex={-1}
            checked={sel.size === subjects.length && subjects.length > 0}
            onChange={(e) => setSel(e.target.checked ? new Set(subjects.map((s) => s.id)) : new Set())}
            aria-label="Select all"
          />
          <span>{sel.size ? `${sel.size} selected` : 'Select rows to limit the tools'}</span>
        </label>
        {sel.size > 0 && (
          <button type="button" className="link" onClick={() => setSel(new Set())}>
            Clear selection
          </button>
        )}
      </div>
      <ol className="bulk-list">
        {subjects.map((s, i) => (
          <li key={s.id} className={`bulk-row${sel.has(s.id) ? ' bulk-row--sel' : ''}${h.present[s.id] !== initial[s.id] ? ' bulk-row--changed' : ''}`}>
            <input
              type="checkbox"
              tabIndex={-1}
              checked={sel.has(s.id)}
              aria-label={`Select ${h.present[s.id]}`}
              onChange={(e) => {
                const next = new Set(sel);
                if (e.target.checked) next.add(s.id);
                else next.delete(s.id);
                setSel(next);
                anchorRef.current = i;
              }}
            />
            <span className="bulk-row__n">{i + 1}</span>
            <input
              ref={(el) => {
                if (el) inputs.current.set(s.id, el);
                else inputs.current.delete(s.id);
              }}
              className="bulk-row__title"
              value={h.present[s.id] ?? ''}
              aria-label={`Title ${i + 1}`}
              onFocus={() => {
                if (!extending.current) anchorRef.current = i;
              }}
              onChange={(e) => {
                const value = e.target.value;
                setH((prev) => historyCommit(prev, { ...prev.present, [s.id]: value }, { key: s.id }));
              }}
            />
            <small className="bulk-row__host">{hostOf(s.originalUrl || s.url)}</small>
          </li>
        ))}
      </ol>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Per-item metadata editor (from the library or the clip menu)

export function EditImportSheet({ videoId }: { videoId: string }) {
  const close = useUI((s) => s.closeSheet);
  const openSheet = useUI((s) => s.openSheet);
  const item = useStore((s) => activeData(s).imports.items[videoId]);
  const batch = useStore((s) => activeData(s).imports.batches.find((b) => b.id === item?.batchId));
  const updateImports = useStore((s) => s.updateImports);
  const deleteImports = useStore((s) => s.deleteImports);
  const tx = useTaxonomy((s) => s.tx);
  const [title, setTitle] = useState(item?.title ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [tags, setTags] = useState<string[]>(item?.tags ?? []);
  const [tagText, setTagText] = useState('');
  const [confirm, setConfirm] = useState(false);
  if (!item) return null;
  const matched = matchTagIds(tags, tx?.tags ?? []);
  const save = () => {
    const refused = updateImports({ [item.id]: { title: title.trim() || item.title, notes: notes.trim(), tags, tagIds: matched } });
    if (refused) return toast('That text isn’t allowed. Only content with consenting adults can be imported.', 'error');
    toast('Saved', 'save');
    close();
  };
  return (
    <Sheet
      onClose={close}
      title="Edit details"
      subtitle={`${TYPE_LABEL[item.mediaType]} from ${item.host}`}
      footer={
        <button type="button" className="btn btn--primary btn--block" onClick={save}>
          Save
        </button>
      }
    >
      <label className="field">
        <span>Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" />
      </label>
      <div className="field">
        <span>Personal tags</span>
        <div className="chips">
          {tags.map((t) => (
            <Chip key={t} tone={matched.some((id) => tx?.tags.find((x) => x.id === id)?.label.toLowerCase() === t.toLowerCase()) ? 'accent' : undefined} onRemove={() => setTags(tags.filter((x) => x !== t))}>
              #{t}
            </Chip>
          ))}
        </div>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            const add = parseTagInput(tagText);
            if (add.length) setTags(cleanTags([...tags, ...add]));
            setTagText('');
          }}
        >
          <input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="Add tags" aria-label="Add tags" />
          <button className="btn" type="submit">
            Add
          </button>
        </form>
        {matched.length > 0 && <small className="muted">Understood by filters & learning: {matched.map((id) => tx?.tags.find((t) => t.id === id)?.label ?? id).join(', ')}</small>}
      </div>
      <label className="field">
        <span>Notes</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Anything you want to remember" />
      </label>
      <MenuItem icon={<IconExternal />} label="Open original" hint={hostOf(item.originalUrl)} onClick={() => window.open(item.originalUrl, '_blank', 'noopener')} />
      {batch && <MenuItem icon="⇪" label={`Part of “${batch.name}”`} hint={`${plural(batch.itemIds.length, 'item')} · ${dayLabel(batch.createdAt)}`} onClick={() => openSheet({ kind: 'import', batchId: batch.id })} />}
      <div className="danger-zone">
        {confirm ? (
          <div className="confirm">
            <span>Delete this import from everywhere (saves, boards, history, learning)?</span>
            <div className="row">
              <button type="button" className="btn btn--danger" onClick={() => { deleteImports([item.id]); close(); toast('Deleted'); }}>
                Delete
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setConfirm(false)}>
                Keep
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn btn--ghost btn--danger-text" onClick={() => setConfirm(true)}>
            <IconTrash size={16} /> Delete import
          </button>
        )}
      </div>
    </Sheet>
  );
}

/** Library entry point helper: start a fresh import (keeps any unfinished draft). */
export function openImport(prefill?: string) {
  const draft = useImportDraft.getState();
  draft.showBatch(null);
  if (prefill) draft.appendText(prefill);
  useUI.getState().openSheet({ kind: 'import' });
}

