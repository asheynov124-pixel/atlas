/**
 * Entry point (FOUNDATION). Order matters: content registers items before the game boots;
 * feature UIs register panels / overlays before the App renders.
 */
import { render } from 'preact';
import './ui/styles.css';
import './content';
import './ui/panels';
import './cosmos/ui';
import './god/ui';
import './studio/ui';
import { Game } from './game/Game';
import { App } from './ui/App';
import { installDebug } from './dev/debug';
import { registerServiceWorker } from './dev/pwa';

const root = document.getElementById('app')!;
const game = new Game(document.body);
render(<App />, root);
installDebug(game);
void game.boot().then(() => {
  document.getElementById('boot')?.remove();
  registerServiceWorker();
});
