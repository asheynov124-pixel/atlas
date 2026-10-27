/** Derived state: the taste model and lookups. */
import { useStore, activeData, type AppState } from './store';
import { cachedSummary } from '../data/api';
import { foldSignals, type TasteModel } from '../engine/learning';
import type { VideoSummary } from '../data/types';
import { isImportId } from '../import/model';

export function lookupVideo(id: string): VideoSummary | undefined {
  if (isImportId(id)) return cachedSummary(id); // live from the batch, never a snapshot
  return useStore.getState().content[id] ?? cachedSummary(id);
}

let memo: { signals: unknown; overrides: unknown; content: unknown; imports: unknown; model: TasteModel } | null = null;

export function modelOf(s: AppState): TasteModel {
  const d = activeData(s);
  // Imports count too: editing an imported clip's tags changes what its likes taught.
  if (memo && memo.signals === d.signals && memo.overrides === d.overrides && memo.content === s.content && memo.imports === d.imports.items) return memo.model;
  const model = foldSignals(d.signals, (id) => (isImportId(id) ? cachedSummary(id) : s.content[id] ?? cachedSummary(id)), d.overrides);
  memo = { signals: d.signals, overrides: d.overrides, content: s.content, imports: d.imports.items, model };
  return model;
}

export function getModel(): TasteModel {
  return modelOf(useStore.getState());
}

export function useModel(): TasteModel {
  return useStore(modelOf);
}

export const useActiveData = () => useStore(activeData);
