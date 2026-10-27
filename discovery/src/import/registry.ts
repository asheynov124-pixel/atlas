/**
 * Live view of the active profile's imports for the data layer.
 *
 * The store registers a provider at start-up; the data layer reads through
 * it. Keeping it a provider (rather than importing the store) avoids a cycle
 * between `data/api` and `state/store`.
 */
import type { ImportItem } from './types';

export interface ImportProvider {
  /** Items in the active profile, newest batch first, batch order within. */
  active: () => ImportItem[];
  /** Lookup by id, in the active profile only. */
  byId: (id: string) => ImportItem | undefined;
}

let provider: ImportProvider = { active: () => [], byId: () => undefined };

export function setImportProvider(p: ImportProvider) {
  provider = p;
}

export const activeImports = () => provider.active();
export const importById = (id: string) => provider.byId(id);
