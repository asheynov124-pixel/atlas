/**
 * OWNER: studio.
 * Reactive editor state shared by the Studio system and its UI (Preact signals). Mutations go through
 * game.studio (Studio.ts) so undo, the 3D preview and dirty-tracking stay in sync.
 */
import { signal } from '@preact/signals';
import type { DesignSpec } from './model';
import type { Family } from './parts';

export type StudioTab = 'parts' | 'edit' | 'templates' | 'save';

export const studioUi = {
  /** the studio overlay is up */
  open: signal(false),
  /** the design being edited (immutable snapshots) */
  draft: signal<DesignSpec | null>(null),
  /** id of the saved design being edited (null = not saved yet) */
  editingId: signal<string | null>(null),
  /** selected part index (-1 none) */
  selected: signal(-1),
  tab: signal<StudioTab>('templates'),
  night: signal(false),
  dirty: signal(false),
  canUndo: signal(false),
  canRedo: signal(false),
  /** live preview figures */
  triangles: signal(0),
  height: signal(0),
  /** this city's saved designs */
  designs: signal<DesignSpec[]>([]),
  /** device-library designs not in this city */
  library: signal<DesignSpec[]>([]),
  /** success card after saving */
  saved: signal<{ id: string; name: string; fresh: boolean } | null>(null),
  /** add-part grid family filter */
  family: signal<Family | 'all'>('all'),
  /** bumps when the user picks a part on the stage (UI scrolls to it) */
  pickTick: signal(0),
};
