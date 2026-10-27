import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { startTabs } from './state/tabs';
import { queuePage, startHandoffListener } from './import/handoff';
import './styles/app.css';

// Before the first render: routing must not see the handoff hash, and nothing may be
// written until this tab knows whether another one is already live.
startTabs(queuePage);
startHandoffListener();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) registerSW({ immediate: true });
