/** Proactive AI path ideas, surfaced once the profile has enough signal. */
import { useMemo } from 'react';
import { useStore, activeData } from '../../state/store';
import { useUI } from '../../state/ui';
import { useModel, lookupVideo } from '../../state/selectors';
import { useTaxonomy } from '../../state/taxonomy';
import { suggestPaths, type PathSuggestion } from '../../ai/suggest';
import { startPath } from '../../state/feed';
import { IconSparkle, IconX } from '../../components/Icons';

export function useSuggestions(): PathSuggestion[] {
  const model = useModel();
  const paths = useStore((s) => activeData(s).paths);
  const dismissed = useStore((s) => activeData(s).dismissed);
  const tx = useTaxonomy((s) => s.tx);
  return useMemo(() => {
    if (!tx) return [];
    return suggestPaths(model, lookupVideo, paths, tx).filter((s) => !dismissed.includes(s.id));
    // Recompute when positive mass changes, not on every content update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.positives.length, model.counts.positive, paths.length, dismissed, tx]);
}

export function SuggestionBanner() {
  const suggestions = useSuggestions();
  const dismiss = useStore((s) => s.dismiss);
  const index = useStore((s) => {
    const d = activeData(s);
    return d.paths.find((p) => p.id === d.activePathId)?.index ?? 0;
  });
  const hidden = useUI((s) => s.overlayHidden);
  const s = suggestions[0];
  // Don't interrupt the first few clips of a session.
  if (!s || hidden || index < 3) return null;
  return (
    <div className="suggest" data-no-gesture role="status">
      <IconSparkle size={18} />
      <button type="button" className="suggest__body" onClick={() => startPath(s.seed, { label: s.label })}>
        <strong>Path idea: {s.label}</strong>
        <small>{s.reason}</small>
      </button>
      <button type="button" className="suggest__go" onClick={() => startPath(s.seed, { label: s.label })}>
        Start
      </button>
      <button type="button" className="icon-btn icon-btn--small" aria-label="Dismiss suggestion" onClick={() => dismiss(s.id)}>
        <IconX size={16} />
      </button>
    </div>
  );
}
