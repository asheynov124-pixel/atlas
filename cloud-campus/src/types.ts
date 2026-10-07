import type Matter from 'matter-js';
import type { Actor } from './actor';

export interface Vec {
  x: number;
  y: number;
}

export type PowerId =
  | 'strength' | 'flight' | 'invuln'
  | 'plants' | 'fire'
  | 'melt' | 'guinea' | 'glow'
  | 'tech' | 'pacifier'
  | 'clone' | 'stretch' | 'speed'
  | 'rock' | 'ice'
  | 'comet' | 'sonic' | 'grow' | 'xray';

export type Role = 'hero' | 'sidekick' | 'faculty' | 'villain';

export interface CharacterDef {
  id: string;
  name: string;
  role: Role;
  color: string;
  radius: number;
  mass: number;
  speed: number;
  powers: PowerId[];
  blurb: string;
}

/** Body shapes a character can take. Form toggles swap between these. */
export type Form = 'normal' | 'puddle' | 'guinea' | 'rock' | 'giant';

export type PropType =
  | 'crate' | 'ball' | 'table' | 'chair' | 'tray' | 'mat' | 'dummy'
  | 'can' | 'book' | 'dodgeball' | 'cell';

export interface Prop {
  body: Matter.Body;
  type: PropType;
  color: string;
  born: number;
  /** Debris (cans, books) despawns when it falls; everything else respawns on the pad. */
  debris: boolean;
  baseFriction: number;
  burnT: number;
  charred: number;
  frozenT: number;
  scale: number;
}

export interface Projectile {
  body: Matter.Body;
  owner: Actor;
  kind: 'fireball' | 'spark';
  life: number;
  gravityComp: number;
  dead: boolean;
}

export interface IceWall {
  body: Matter.Body;
  owner: Actor;
  life: number;
  max: number;
  w: number;
  h: number;
}

/** What a Matter body is, stored on body.plugin.cc. */
export type Tag =
  | { kind: 'actor'; actor: Actor }
  | { kind: 'prop'; prop: Prop }
  | { kind: 'proj'; proj: Projectile }
  | { kind: 'ice'; ice: IceWall }
  | { kind: 'terrain' }
  | { kind: 'sensor'; id: string };

export function tagOf(body: Matter.Body | undefined | null): Tag | undefined {
  if (!body) return undefined;
  const root = body.parent ?? body;
  return (root.plugin as { cc?: Tag } | undefined)?.cc;
}

export function setTag(body: Matter.Body, tag: Tag) {
  body.plugin = { ...(body.plugin ?? {}), cc: tag };
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const sign = (v: number) => (v < 0 ? -1 : 1);

export function norm(x: number, y: number): Vec {
  const l = Math.hypot(x, y);
  return l < 1e-6 ? { x: 0, y: 0 } : { x: x / l, y: y / l };
}
