import { useEffect, useRef } from 'react';
import { InlineText } from '../edit/InlineText';
import { ImageTools } from '../edit/ImageTools';
import { addItemToSlot, addSwatch, deleteSwatch, removeItemFromSlot, updateItem, updateSwatch } from '../store/actions';
import { useSpread } from '../reader/context';
import { CLEAN_ROWS, parsePrice } from '../templates/items';
import type { CleanFields, Item, Swatch } from '../model/types';

/**
 * The Clean materials panel, as a form on the card. Every field starts at "Not yet
 * checked"; whatever is chosen is what someone read on a spec sheet, never a guess.
 */
export function CleanEditor({ item }: { item: Item }) {
  const set = (key: keyof CleanFields, value: string) =>
    updateItem(item.id, (it) => {
      (it.clean as Record<string, string>)[key] = value;
    });
  return (
    <fieldset className="clean clean--edit">
      <legend className="sc">Clean materials</legend>
      {CLEAN_ROWS.map((r) => (
        <label key={r.key} className="clean__row">
          <span>{r.label}</span>
          <select value={item.clean[r.key]} onChange={(e) => set(r.key, e.target.value)}>
            <option value="">Not yet checked</option>
            {r.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      <InlineText
        as="p"
        className="clean__notes"
        value={item.clean.notes}
        onCommit={(v) => set('notes', v)}
        placeholder="Where this came from (spec sheet, label, email)"
        multiline
      />
    </fieldset>
  );
}

/** A colour well that commits when the picker closes. */
function HexWell({ value, onCommit, label }: { value: string; onCommit: (v: string) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.value = value;
    const onChange = () => el.value.toLowerCase() !== value.toLowerCase() && onCommit(el.value.toUpperCase());
    el.addEventListener('change', onChange);
    return () => el.removeEventListener('change', onChange);
  }, [value, onCommit]);
  return <input ref={ref} type="color" className="swatch__well" defaultValue={value} aria-label={label} />;
}

export function SwatchTools({ spreadId, swatch }: { spreadId: string; swatch: Swatch }) {
  return (
    <>
      <HexWell value={swatch.hex} label={`Colour of ${swatch.name}`} onCommit={(hex) => updateSwatch(spreadId, swatch.id, { hex })} />
      <InlineText className="swatch__name" value={swatch.name} onCommit={(v) => updateSwatch(spreadId, swatch.id, { name: v || 'Untitled' })} placeholder="Name" />
      <span className="swatch__row">
        <InlineText
          className="swatch__hex sc"
          value={swatch.hex.toUpperCase()}
          raw
          onCommit={(v) => /^#?[0-9a-f]{6}$/i.test(v) && updateSwatch(spreadId, swatch.id, { hex: `#${v.replace('#', '').toUpperCase()}` })}
          placeholder="#HEX"
        />
        <button type="button" className="swatch__remove" onClick={() => deleteSwatch(spreadId, swatch.id)} aria-label={`Remove ${swatch.name}`}>
          ×
        </button>
      </span>
    </>
  );
}

SwatchTools.Add = function AddSwatch({ spreadId }: { spreadId: string }) {
  return (
    <li className="swatch swatch--add">
      <button type="button" onClick={() => addSwatch(spreadId)}>
        + Colour
      </button>
    </li>
  );
};

export function MaterialTools({ item }: { item: Item }) {
  const { placed } = useSpread();
  const edit = (recipe: (it: Item) => void) => updateItem(item.id, recipe);
  return (
    <div className="mat__fields">
      <InlineText as="h4" className="mat__name" value={item.name} onCommit={(v) => edit((it) => void (it.name = v || 'Untitled'))} placeholder="Name" />
      <InlineText className="mat__meta" value={item.finish} onCommit={(v) => edit((it) => void (it.finish = v))} placeholder="Finish" />
      <InlineText className="mat__meta" value={item.brand} onCommit={(v) => edit((it) => void (it.brand = v))} placeholder="Maker" />
      <span className="mat__price-row">
        <InlineText
          className="mat__meta"
          value={item.price === null ? '' : String(item.price)}
          onCommit={(v) => edit((it) => void (it.price = parsePrice(v)))}
          placeholder="Price"
          raw
          inputMode="decimal"
        />
        <InlineText className="mat__meta" value={item.unit} onCommit={(v) => edit((it) => void (it.unit = v))} placeholder="per sq ft" />
      </span>
      <InlineText className="mat__meta" value={item.url} onCommit={(v) => edit((it) => void (it.url = v))} placeholder="Link" raw inputMode="url" />
      <InlineText className="mat__meta" value={item.retailer} onCommit={(v) => edit((it) => void (it.retailer = v))} placeholder="Where to buy" />
      <button type="button" className="mat__remove" onClick={() => removeItemFromSlot(placed.spread.id, 'items', item.id)}>
        Remove
      </button>
    </div>
  );
}

MaterialTools.Add = function AddMaterial({ spreadId }: { spreadId: string }) {
  return (
    <button type="button" className="add-item" onClick={() => addItemToSlot(spreadId, 'items', { name: 'New material', label: 'Sample to come' }, 'material')}>
      + Add a material
    </button>
  );
};

MaterialTools.Image = function MaterialImage({ item }: { item: Item }) {
  return <ImageTools target={{ kind: 'item', itemId: item.id }} compact />;
};
