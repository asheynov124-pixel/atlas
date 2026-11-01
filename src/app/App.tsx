import { useEffect } from 'react';
import { useBookStore } from '@/state/bookStore';
import { useUiStore } from '@/state/uiStore';
import { bootstrap } from '@/state/bootstrap';
import { Reader } from '@/reader/Reader';
import { Strip } from '@/editor/Strip';
import { ChaptersPanel } from '@/editor/ChaptersPanel';
import { ThemePanel } from '@/editor/ThemePanel';
import { EditionsPanel } from '@/editor/EditionsPanel';
import { AuthorPrompt } from '@/editor/AuthorPrompt';
import { Chrome } from './Chrome';
import { Specimen } from './Specimen';
import { useRoute } from './router';
import { useApplyTheme } from './useTheme';

export default function App() {
  const route = useRoute();
  const theme = useBookStore((s) => s.book.theme);
  const loaded = useBookStore((s) => s.loaded);
  const mode = useUiStore((s) => s.mode);
  const panel = useUiStore((s) => s.panel);
  useApplyTheme(theme);

  useEffect(() => {
    void bootstrap();
  }, []);

  // global undo / redo, except while typing in an editor (which has its own)
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== 'z' && e.key.toLowerCase() !== 'y') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (useUiStore.getState().mode !== 'edit') return;
      e.preventDefault();
      const temporal = useBookStore.temporal.getState();
      if (e.key.toLowerCase() === 'y' || e.shiftKey) temporal.redo();
      else temporal.undo();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  if (route.kind === 'specimen') return <Specimen />;
  if (route.kind === 'print') return <Specimen />;
  if (!loaded) return <div aria-busy="true" style={{ position: 'fixed', inset: 0, background: 'var(--desk)' }} />;

  return (
    <>
      <Reader route={route} />
      <Chrome />
      {mode === 'edit' && <Strip />}
      {panel === 'chapters' && <ChaptersPanel />}
      {panel === 'theme' && <ThemePanel />}
      {panel === 'editions' && <EditionsPanel />}
      {panel === 'author' && <AuthorPrompt />}
    </>
  );
}
