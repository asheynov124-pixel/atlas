import type { MaterialCard } from '@/book/types';
import { patchMaterial, patchMaterialClean, placeMaterialAsset, removeMaterial } from '@/state/actions';
import { useBookStore } from '@/state/bookStore';
import { Sheet, sheetStyles } from '@/editor/Sheet';
import controls from '@/editor/controls.module.css';
import { useEditSession } from '@/editor/session';
import { ingestFiles } from '@/editor/assets';
import { CleanFieldsEditor } from './CleanFieldsEditor';

export function MaterialSheet({ spreadId, slotKey, cardId, onClose }: { spreadId: string; slotKey: string; cardId: string; onClose: () => void }) {
  const card = useBookStore((s) => {
    const sp = s.book.chapters.flatMap((c) => c.spreads).find((x) => x.id === spreadId);
    const slot = sp?.slots[slotKey];
    return slot?.kind === 'materials' ? slot.cards.find((c) => c.id === cardId) : undefined;
  });
  const { change, end } = useEditSession();
  if (!card) return null;
  const set = (patch: Partial<MaterialCard>) => change(() => patchMaterial(spreadId, slotKey, card.id, patch));
  return (
    <Sheet title={card.name || 'Material'} onClose={onClose} testId="material-sheet">
      <div className={controls.fieldGrid}>
        <label className={controls.field}>
          <span className="t-label">Name</span>
          <input className={controls.input} value={card.name} onChange={(e) => set({ name: e.target.value })} onBlur={end} data-testid="material-name" />
        </label>
        <label className={controls.field}>
          <span className="t-label">Finish</span>
          <input className={controls.input} value={card.finish} placeholder="Honed, satin, rough-sawn…" onChange={(e) => set({ finish: e.target.value })} onBlur={end} />
        </label>
        <div className={controls.fieldRow}>
          <label className={controls.field}>
            <span className="t-label">Maker</span>
            <input className={controls.input} value={card.maker} onChange={(e) => set({ maker: e.target.value })} onBlur={end} />
          </label>
          <label className={controls.field}>
            <span className="t-label">Link</span>
            <input className={controls.input} type="url" value={card.url} placeholder="https://" onChange={(e) => set({ url: e.target.value })} onBlur={end} />
          </label>
        </div>
        <div className={controls.fieldRow}>
          <label className={controls.field}>
            <span className="t-label">Price per unit (USD)</span>
            <input className={controls.number} type="number" inputMode="decimal" min={0} step="0.01" value={card.pricePerUnit ?? ''} onChange={(e) => set({ pricePerUnit: e.target.value === '' ? null : Number(e.target.value) })} onBlur={end} />
          </label>
          <label className={controls.field}>
            <span className="t-label">Unit</span>
            <input className={controls.input} value={card.unit} placeholder="sq ft, linear ft, each" onChange={(e) => set({ unit: e.target.value })} onBlur={end} />
          </label>
        </div>
        <div className={controls.fieldRow}>
          <label className={controls.field}>
            <span className="t-label">Swatch colour</span>
            <input type="color" value={card.swatchColor ?? '#d9d2c7'} onChange={(e) => set({ swatchColor: e.target.value })} onBlur={end} style={{ height: 36, width: '100%', border: '1px solid var(--hairline)', background: 'none', padding: 2 }} />
          </label>
          <label className={controls.field}>
            <span className="t-label">Or a photo of the sample</span>
            <input
              className={controls.input}
              type="file"
              accept="image/*,.heic,.heif"
              onChange={async (e) => {
                const files = e.target.files;
                if (!files?.length) return;
                const [asset] = await ingestFiles(files);
                if (asset) placeMaterialAsset(spreadId, slotKey, card.id, asset);
                e.target.value = '';
              }}
            />
          </label>
        </div>
        {card.assetId && (
          <button type="button" className={sheetStyles.button} data-quiet="true" onClick={() => set({ assetId: null })}>Use the colour swatch instead of the photo</button>
        )}
        <CleanFieldsEditor value={card.clean} onChange={(patch) => change(() => patchMaterialClean(spreadId, slotKey, card.id, patch))} />
        <div className={sheetStyles.row}>
          <button type="button" className={sheetStyles.button} data-quiet="true" onClick={() => { removeMaterial(spreadId, slotKey, card.id); onClose(); }}>Remove this material</button>
        </div>
      </div>
    </Sheet>
  );
}
