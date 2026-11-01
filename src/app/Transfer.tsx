import { useRef, useState } from 'react';
import { exportBookZip, exportFilename, importBookZip, downloadBlob } from '@/storage/zip';
import { getStorage } from '@/storage';
import { forgetAsset } from '@/storage/assetUrls';
import { useBookStore } from '@/state/bookStore';
import { useUiStore } from '@/state/uiStore';
import { replaceBook } from '@/state/actions';
import { flushSaves } from '@/state/bootstrap';
import { Sheet, sheetStyles } from '@/editor/Sheet';

/** Export the book as a .zip, share it, or import one from the other phone. */
export function TransferSheet({ onClose }: { onClose: () => void }) {
  const book = useBookStore((s) => s.book);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmImport, setConfirmImport] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator && 'canShare' in navigator;
  const photoCount = Object.values(book.assets).filter((a) => a.source === 'idb').length;

  const build = async () => {
    await flushSaves();
    setBusy('Packing the book…');
    const blob = await exportBookZip(useBookStore.getState().book, getStorage(), (d, t) => setBusy(`Packing photos ${d} of ${t}…`));
    setBusy(null);
    return new File([blob], exportFilename(book), { type: 'application/zip' });
  };

  const onExport = async () => {
    try {
      const file = await build();
      downloadBlob(file, file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed.');
      setBusy(null);
    }
  };

  const onShare = async () => {
    try {
      const file = await build();
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: book.title });
      else downloadBlob(file, file.name);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(e instanceof Error ? e.message : 'Share failed.');
      setBusy(null);
    }
  };

  const doImport = async (file: File) => {
    setConfirmImport(null);
    setError(null);
    try {
      setBusy('Keeping the current book as an edition…');
      await getStorage().saveEdition(`Before importing ${file.name}`, useBookStore.getState().book);
      setBusy('Reading the book…');
      const next = await importBookZip(file, getStorage(), (d, t) => setBusy(`Unpacking photos ${d} of ${t}…`));
      for (const id of Object.keys(next.assets)) forgetAsset(id);
      replaceBook(next);
      useBookStore.temporal.getState().clear();
      useUiStore.getState().clearCompare();
      setBusy(null);
      onClose();
      window.location.hash = '#/i/0';
    } catch (e) {
      setBusy(null);
      setError(e instanceof Error ? e.message : 'Import failed.');
    }
  };

  return (
    <Sheet title="Share the book" onClose={onClose} testId="transfer-sheet">
      <p className={sheetStyles.hint}>
        Export packs the whole book into one .zip: every word and {photoCount === 1 ? 'the one photo' : `${photoCount} photos`} added on this device. Open it on the other phone with Import and the books match.
      </p>
      <div className={sheetStyles.row} style={{ flexWrap: 'wrap' }}>
        <button type="button" className={sheetStyles.button} data-primary="true" onClick={() => void onExport()} disabled={!!busy} data-testid="export-zip">Export .zip</button>
        {canShare && (
          <button type="button" className={sheetStyles.button} onClick={() => void onShare()} disabled={!!busy}>Share…</button>
        )}
        <button type="button" className={sheetStyles.button} data-quiet="true" onClick={() => inputRef.current?.click()} disabled={!!busy} data-testid="import-zip">Import a .zip…</button>
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip"
          hidden
          data-testid="import-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setConfirmImport(f);
            e.target.value = '';
          }}
        />
      </div>
      {confirmImport && (
        <div className={sheetStyles.row} style={{ flexWrap: 'wrap', padding: 12, border: '1px solid var(--hairline)' }}>
          <p className={sheetStyles.hint} style={{ flexBasis: '100%' }}>
            Replace the book on this device with <b>{confirmImport.name}</b>? The current book is kept as an edition first, so nothing is lost.
          </p>
          <button type="button" className={sheetStyles.button} data-primary="true" onClick={() => void doImport(confirmImport)} data-testid="confirm-import">Replace it</button>
          <button type="button" className={sheetStyles.button} data-quiet="true" onClick={() => setConfirmImport(null)}>Keep mine</button>
        </div>
      )}
      {busy && <p className={sheetStyles.hint} aria-live="polite">{busy}</p>}
      {error && <p className={sheetStyles.hint} role="alert" style={{ color: 'var(--clay)' }}>{error}</p>}
      <p className={sheetStyles.hint}>Photos that came from <code>import-photos</code> are part of the site itself, so they are already on both phones and are not packed.</p>
    </Sheet>
  );
}
