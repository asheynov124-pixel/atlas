import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/instrument-serif/latin-400.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import '@fontsource-variable/newsreader/standard.css';
import '@fontsource-variable/newsreader/standard-italic.css';
import '@fontsource-variable/inter/opsz.css';
import '@fontsource-variable/caveat/wght.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/paper.css';
import './styles/print.css';
import { registerSW } from 'virtual:pwa-register';
import App from './app/App';

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
