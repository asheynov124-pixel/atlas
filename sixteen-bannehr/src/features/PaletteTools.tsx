import type { Item, Swatch } from '../model/types';

// Phase 1 placeholders: editing swatches, materials and the Clean panel arrives in Phase 3.
export function CleanEditor(_props: { item: Item }) {
  return null;
}

export function SwatchTools(_props: { spreadId: string; swatch: Swatch }) {
  return null;
}
SwatchTools.Add = function AddSwatch(_props: { spreadId: string }) {
  return null;
};

export function MaterialTools({ item }: { item: Item }) {
  return <h4 className="mat__name">{item.name}</h4>;
}
MaterialTools.Add = function AddMaterial(_props: { spreadId: string }) {
  return null;
};
