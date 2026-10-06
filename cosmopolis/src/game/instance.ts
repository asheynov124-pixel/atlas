/** Global Game singleton (live binding). Set once in main.tsx. */
import type { Game } from './Game';

export let game: Game = null as unknown as Game;
export function setGame(g: Game): void {
  game = g;
}
