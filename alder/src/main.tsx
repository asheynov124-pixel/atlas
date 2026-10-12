import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './styles.css';
import { migrateV1 } from './lib/store';
import { ErrorBoundary } from './components/ErrorBoundary';

try { migrateV1(); } catch { /* an old or odd backup should never stop the app from opening */ }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <App />
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
