import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import '@fontsource/shippori-mincho/latin-600.css';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { startClock } from './store';
import { installInvalidSync } from './ui/invalid';
import './styles.css';

startClock();
installInvalidSync();
createRoot(document.getElementById('root')!).render(<App />);
