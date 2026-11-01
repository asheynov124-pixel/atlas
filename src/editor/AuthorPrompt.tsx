import type { Author } from '@/book/types';
import { useUiStore } from '@/state/uiStore';
import { Sheet, sheetStyles } from './Sheet';
import styles from './Panels.module.css';

/** Asked once per device: whose notes and hearts are these? */
export function AuthorPrompt() {
  const author = useUiStore((s) => s.author);
  const setAuthor = useUiStore((s) => s.setAuthor);
  const setPanel = useUiStore((s) => s.setPanel);
  const setMode = useUiStore((s) => s.setMode);
  const choose = (a: Author) => {
    setAuthor(a);
    setPanel(null);
    setMode('edit');
  };
  return (
    <Sheet title="Who is editing?" onClose={() => setPanel(null)} testId="author-prompt">
      <p className={sheetStyles.hint}>Notes and favourites are signed. You can change this from the toolbar later.</p>
      <div className={styles.authorChoice}>
        <button type="button" className={styles.authorButton} onClick={() => choose('sonny')} aria-pressed={author === 'sonny'} data-testid="author-sonny">
          <span className={styles.authorDot} style={{ background: '#f3d9cc' }} />
          <span className={styles.authorName}>Sonny</span>
        </button>
        <button type="button" className={styles.authorButton} onClick={() => choose('adi')} aria-pressed={author === 'adi'} data-testid="author-adi">
          <span className={styles.authorDot} style={{ background: '#dfe4cf' }} />
          <span className={styles.authorName}>Adi</span>
        </button>
      </div>
    </Sheet>
  );
}
