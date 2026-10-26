import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/newsreader/opsz-italic.css';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/caveat/wght.css';

import './styles/tokens.css';
import './styles/base.css';
import './styles/book.css';
import './styles/templates.css';
import './styles/pages.css';
import './styles/turn.css';
import './styles/edit.css';
import './styles/features.css';
import './styles/print.css';

import { App } from './App';
import { boot } from './store/persistence';

// Offline and home screen: the service worker precaches the book's shell and type.
// (Not in the claude.ai artifact build: the viewer refuses service workers.)
if (import.meta.env.PROD && import.meta.env.MODE !== 'artifact') {
  void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}

// Open the saved book (or the seed) before the first paint, so the book never flickers
// from the seed to her edits.
void boot().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
