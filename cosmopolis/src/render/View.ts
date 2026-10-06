/** A renderable scene the Engine can show (planet surface, star system, galaxy, universe, studio). CONTRACT. */
import type { PerspectiveCamera, Scene } from 'three';
import type { ViewKind } from '../core/types';

export interface View {
  readonly kind: ViewKind;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  /** real seconds */
  update(dt: number): void;
  onResize?(width: number, height: number): void;
  /** called when the engine switches to this view */
  enter?(): void;
  /** called when the engine switches away */
  exit?(): void;
  dispose(): void;
}
