/** Derived state: the taste model and lookups. */
import { useStore, activeData, type AppState } from './store';
import { cachedSummary } from '../data/api';
import { foldSignals, type TasteModel } from '../engine/learning';
import type { VideoSummary } from '../data/types';

export function lookupVideo(id: string): VideoSummary | undefined {
  return useStore.getState().content[id] ?? cachedSummary(id);
}

let memo: { signals: unknown; overrides: unknown; content: unknown; model: TasteModel } | null = null;

export function modelOf(s: AppState): TasteModel {
  const d = activeData(s);
  if (memo && memo.signals === d.signals && memo.overrides === d.overrides && memo.content === s.content) return memo.model;
  const model = foldSignals(d.signals, (id) => s.content[id] ?? cachedSummary(id), d.overrides);
  memo = { signals: d.signals, overrides: d.overrides, content: s.content, model };
  return model;
}

export function getModel(): TasteModel {
  return modelOf(useStore.getState());
}

export function useModel(): TasteModel {
  return useStore(modelOf);
}

export const useActiveData = () => useStore(activeData);
