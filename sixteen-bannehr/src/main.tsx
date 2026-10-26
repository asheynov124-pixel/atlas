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
import './styles/turn.css';

import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
