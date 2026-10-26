import { useRef, useState } from 'react';
import { Sheet } from './Panels';
import { getBook, replaceBook } from '../store/book';
import { useAssets } from '../store/assets';
import { flushSave } from '../store/persistence';
import { useNav } from '../store/nav';
import { repository } from '../storage/dexie';
import { exportZip, importZip, zipName } from '../storage/zip';
import { printBook } from '../reader/Print';
import { useMode } from '../store/prefs';

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Share the book between our two phones: one .zip out, one .zip in. And print. */
export default function SharePanel({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const go = useNav((s) => s.go);
  const setEditing = useMode((s) => s.setEditing);

  const make = async () => {
    await flushSave();
    const book = getBook();
    setBusy('Binding the book…');
    try {
      return { blob: await exportZip(repository(), book, (d, t) => setBusy(`Binding the book… photo ${d} of ${t}`)), name: zipName(book) };
    } finally {
      setBusy(null);
    }
  };

  const onExport = async () => {
    setError(null);
    try {
      const { blob, name } = await make();
      download(blob, name);
      setMessage(`Saved ${name} (${(blob.size / 1_048_576).toFixed(1)} MB).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The book could not be exported.');
    }
  };

  const canShareFiles = typeof navigator !== 'undefined' && 'canShare' in navigator;
  const onSend = async () => {
    setError(null);
    try {
      const { blob, name } = await make();
      const file = new File([blob], name, { type: 'application/zip' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: getBook().title, text: 'The latest edition of the book.' });
        setMessage('Sent.');
      } else {
        download(blob, name);
        setMessage(`This browser cannot send files directly, so ${name} was saved instead.`);
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setError(e instanceof Error ? e.message : 'The book could not be sent.');
    }
  };

  const onImport = async (file: File) => {
    setError(null);
    setBusy('Opening the book…');
    try {
      const result = await importZip(repository(), file);
      useAssets.setState({ map: {}, developing: {} });
      replaceBook(result.book);
      setPending(null);
      setMessage(
        `Opened “${result.book.title}”: ${result.assets} ${result.assets === 1 ? 'photo' : 'photos'}, ${result.editions} ${result.editions === 1 ? 'edition' : 'editions'}.`,
      );
      go(result.book.chapters[0]?.spreads[0]?.id ?? '', 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That file could not be opened.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet title="Share the book" kicker="Between our two phones" onClose={onClose}>
      <section className="share">
        <h3 className="share__h">Send it</h3>
        <p className="share__p">The whole book in one .zip: every word, every photo, every edition. Open it on the other phone and it is the same book.</p>
        <div className="share__row">
          {canShareFiles ? (
            <button type="button" className="btn btn--primary" onClick={() => void onSend()} disabled={!!busy}>
              Send the book…
            </button>
          ) : null}
          <button type="button" className={canShareFiles ? 'btn' : 'btn btn--primary'} onClick={() => void onExport()} disabled={!!busy}>
            Save as .zip
          </button>
        </div>
      </section>

      <section className="share">
        <h3 className="share__h">Open one</h3>
        <p className="share__p">Opening a book from a .zip replaces the book on this device, editions included. If this device has changes worth keeping, save it as a .zip first.</p>
        <input
          ref={input}
          type="file"
          accept=".zip,application/zip"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setPending(f);
            e.target.value = '';
          }}
        />
        {pending ? (
          <div className="share__confirm" role="alertdialog" aria-label="Replace the book on this device?">
            <p>
              Replace this device’s book with <strong>{pending.name}</strong>?
            </p>
            <div className="share__row">
              <button type="button" className="btn btn--primary" onClick={() => void onImport(pending)} disabled={!!busy}>
                Replace it
              </button>
              <button type="button" className="btn" onClick={() => setPending(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn" onClick={() => input.current?.click()} disabled={!!busy}>
            Open a .zip…
          </button>
        )}
      </section>

      <section className="share">
        <h3 className="share__h">Print it</h3>
        <p className="share__p">Each spread becomes one landscape page, 11 × 8.5 in. Choose “Save as PDF” in the print dialog for a book you can send to a printer.</p>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setEditing(false);
            onClose();
            setTimeout(() => void printBook(), 60);
          }}
        >
          Print or save as PDF…
        </button>
      </section>

      {busy ? (
        <p className="sheet-note" role="status">
          {busy}
        </p>
      ) : null}
      {message && !busy ? (
        <p className="sheet-note" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="sheet-note sheet-note--error" role="alert">
          {error}
        </p>
      ) : null}
    </Sheet>
  );
}
