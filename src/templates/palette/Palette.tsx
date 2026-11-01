import { useState, type CSSProperties } from 'react';
import { isSlotKind, stripHtml } from '@/book/slots';
import { addMaterial, placeMaterialAsset, patchMaterial } from '@/state/actions';
import { MaterialSheet } from '@/features/MaterialSheet';
import { EditableImage } from '@/editor/EditableImage';
import controls from '@/editor/controls.module.css';
import features from '@/features/features.module.css';
import type { MaterialCard } from '@/book/types';
import { CLEAN_LABEL, money } from '@/book/words';
import { Plate } from '@/reader/Plate';
import { RichText } from '@/reader/RichText';
import { Page, Spread } from '@/reader/Spread';
import type { SpreadCtx } from '@/reader/SpreadContext';
import shared from '../shared.module.css';
import styles from './Palette.module.css';

export function PaletteTemplate({ ctx }: { ctx: SpreadCtx }) {
  const { slots } = ctx.ref.spread;
  const title = isSlotKind(slots.title, 'text') ? slots.title.html : '';
  const cards = isSlotKind(slots.materials, 'materials') ? slots.materials.cards : [];
  const half = Math.ceil(cards.length / 2);
  const left = cards.slice(0, half);
  const right = cards.slice(half);
  const perPage = Math.max(half, 1);
  const cols = perPage <= 2 ? 2 : 3;
  const large = perPage <= 3;
  const style = { '--cols': cols } as CSSProperties;
  const [sheet, setSheet] = useState<string | null>(null);

  return (
    <Spread ctx={ctx} label={`Palette: ${stripHtml(title)}`}>
      <Page side="left">
        <header className={shared.head}>
          <div>
            <p className={[shared.headKicker, 't-label'].join(' ')}>Palette &amp; materials</p>
            <RichText as="h2" html={title} className={[shared.headTitle, 't-display'].join(' ')} slotKey="title" placeholder="Title" />
          </div>
          <p className={[shared.headMeta, 't-label'].join(' ')}>{cards.length} {cards.length === 1 ? 'material' : 'materials'}</p>
        </header>
        <Cards cards={left} style={style} large={large} ctx={ctx} onEdit={setSheet} onAdd={right.length === 0 ? () => setSheet(addMaterial(ctx.ref.spread.id, 'materials')) : undefined} />
      </Page>
      <Page side="right">
        <header className={shared.head}>
          <p className="t-label">Clean materials</p>
          <p className={[shared.headMeta, 't-label'].join(' ')}>Nothing is claimed until checked</p>
        </header>
        <Cards cards={right} style={style} large={large} ctx={ctx} onEdit={setSheet} onAdd={right.length > 0 ? () => setSheet(addMaterial(ctx.ref.spread.id, 'materials')) : undefined} />
      </Page>
      {sheet && <MaterialSheet spreadId={ctx.ref.spread.id} slotKey="materials" cardId={sheet} onClose={() => setSheet(null)} />}
    </Spread>
  );
}

interface CardsProps {
  cards: MaterialCard[];
  style: CSSProperties;
  large: boolean;
  ctx: SpreadCtx;
  onEdit: (id: string) => void;
  onAdd?: () => void;
}

function Cards({ cards, style, large, ctx, onEdit, onAdd }: CardsProps) {
  const spreadId = ctx.ref.spread.id;
  return (
    <ul className={styles.grid} style={style}>
      {cards.map((c) => (
        <li className={styles.card} key={c.id} data-card-id={c.id}>
          <div className={styles.swatch} data-large={large ? 'true' : 'false'} style={c.swatchColor && !c.assetId ? { background: c.swatchColor } : undefined}>
            {c.assetId && !ctx.editable && (
              <Plate
                slot={{ kind: 'image', assetId: c.assetId, focal: { x: 0.5, y: 0.5 }, caption: '', alt: c.name, credit: '', placeholder: c.name }}
                size="tiny"
                sizes="(min-width: 820px) 14vw, 45vw"
              />
            )}
            {c.assetId && ctx.editable && (
              <EditableImage
                target={{
                  key: `material:${c.id}`,
                  place: (assets) => placeMaterialAsset(spreadId, 'materials', c.id, assets[0]),
                  patch: () => undefined,
                  clear: () => patchMaterial(spreadId, 'materials', c.id, { assetId: null }),
                }}
                slot={{ kind: 'image', assetId: c.assetId, focal: { x: 0.5, y: 0.5 }, caption: '', alt: c.name, credit: '', placeholder: c.name }}
                size="tiny"
                sizes="(min-width: 820px) 14vw, 45vw"
              />
            )}
            {c.swatchColor && !c.assetId && <span className={[styles.hex, 't-label'].join(' ')}>{c.swatchColor.replace('#', '').toUpperCase()}</span>}
            {ctx.editable && (
              <span className={features.tileEdit}>
                <button type="button" className={controls.iconButton} onClick={() => onEdit(c.id)} aria-label={`Edit ${c.name}`} title="Edit material" data-testid="material-edit">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z" /><path d="M13.5 6.5l3 3" /></svg>
                </button>
              </span>
            )}
          </div>
          <p className={styles.name}>{c.name}</p>
          {c.finish && <p className={styles.finish}>{c.finish}</p>}
          <p className={[styles.maker, 't-label'].join(' ')}>
            {c.maker && <span>{c.maker}</span>}
            {c.pricePerUnit != null && <span>{money(c.pricePerUnit)}{c.unit ? ` / ${c.unit}` : ''}</span>}
          </p>
          {large ? <CleanPanel card={c} /> : <CleanChips card={c} />}
        </li>
      ))}
      {ctx.editable && onAdd && (
        <li className={styles.card}>
          <button type="button" className={features.addTile} onClick={onAdd} style={{ aspectRatio: '5 / 4' }} data-testid="material-add">
            <span className={controls.ghost}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              Add a material
            </span>
          </button>
        </li>
      )}
    </ul>
  );
}

const FIELDS = [
  ['construction', 'Construction'],
  ['formaldehyde', 'Formaldehyde'],
  ['voc', 'Finish VOC'],
  ['pvcFree', 'PVC'],
  ['leadFree', 'Lead (water)'],
] as const;

export function cleanIsUnchecked(card: MaterialCard) {
  return FIELDS.every(([key]) => card.clean[key] === 'unknown');
}

/** Compact: known facts as chips; one quiet line when nothing has been checked yet. */
export function CleanChips({ card }: { card: MaterialCard }) {
  if (cleanIsUnchecked(card)) {
    return (
      <p className={[styles.unchecked, 't-label'].join(' ')} title="Clean materials: nothing checked yet">
        Clean · unchecked
      </p>
    );
  }
  return (
    <ul className={styles.clean} aria-label="Clean materials">
      {FIELDS.map(([key, label]) => {
        const v = card.clean[key];
        if (v === 'unknown') return null;
        const text = (CLEAN_LABEL[key] as Record<string, string>)[v] ?? v;
        return (
          <li key={key} className={[styles.chip, 't-label'].join(' ')} data-known={v !== 'n/a' ? 'true' : 'false'} title={label}>
            {text}
          </li>
        );
      })}
    </ul>
  );
}

/** Full: a five-row mini table, "Unknown" where nothing has been checked. */
export function CleanPanel({ card }: { card: MaterialCard }) {
  return (
    <div className={styles.panel}>
      <p className={[styles.panelTitle, 't-label'].join(' ')}>Clean materials</p>
      <dl className={styles.panelRows}>
        {FIELDS.map(([key, label]) => (
          <div key={key} className={styles.panelRow}>
            <dt className="t-label">{label}</dt>
            <dd data-known={card.clean[key] !== 'unknown' ? 'true' : 'false'}>{(CLEAN_LABEL[key] as Record<string, string>)[card.clean[key]] ?? card.clean[key]}</dd>
          </div>
        ))}
        {card.clean.notes && (
          <div className={styles.panelRow}>
            <dt className="t-label">Notes</dt>
            <dd>{card.clean.notes}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
