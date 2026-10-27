import { describe, expect, it } from 'vitest';
import { EDGE, intentFor, isTap, lockAxis, progress, shouldCommit, startMode } from '../gestures/classify';

const W = 390;
const H = 844;

describe('gesture classification', () => {
  it('middle of the screen judges; edges and two fingers navigate', () => {
    expect(startMode({ x: W / 2, y: 400, width: W, height: H, pointers: 1 })).toBe('judge');
    expect(startMode({ x: EDGE - 2, y: 400, width: W, height: H, pointers: 1 })).toBe('nav');
    expect(startMode({ x: W - 4, y: 400, width: W, height: H, pointers: 1 })).toBe('nav');
    expect(startMode({ x: W / 2, y: 400, width: W, height: H, pointers: 2 })).toBe('nav');
  });

  it('maps directions to intents for both schemes', () => {
    expect(intentFor('judge', 'x', 50)).toBe('like');
    expect(intentFor('judge', 'x', -50)).toBe('dislike');
    expect(intentFor('judge', 'y', -50)).toBe('save');
    expect(intentFor('judge', 'y', 50)).toBe('capture');
    expect(intentFor('judge', 'y', -50, 'classic')).toBe('next');
    expect(intentFor('judge', 'y', 50, 'classic')).toBe('prev');
    expect(intentFor('nav', 'y', -50)).toBe('next');
    expect(intentFor('nav', 'x', -50)).toBe('pathNext');
    expect(intentFor('nav', 'x', 50)).toBe('pathPrev');
  });

  it('locks an axis only after real movement', () => {
    expect(lockAxis(4, 3)).toBeNull();
    expect(lockAxis(14, 3)).toBe('x');
    expect(lockAxis(3, -14)).toBe('y');
  });

  it('commits on distance or a fast flick in the same direction', () => {
    expect(progress('x', W * 0.15, W, H)).toBeCloseTo(0.5, 1);
    expect(shouldCommit('x', W * 0.31, 0, W, H)).toBe(true);
    expect(shouldCommit('x', 40, 0.8, W, H)).toBe(true);
    expect(shouldCommit('x', 40, -0.8, W, H)).toBe(false); // flick back towards centre
    expect(shouldCommit('x', 20, 2, W, H)).toBe(false); // too short to be deliberate
  });

  it('recognises taps', () => {
    expect(isTap({ dx: 2, dy: 3, ms: 120 })).toBe(true);
    expect(isTap({ dx: 2, dy: 3, ms: 600 })).toBe(false);
    expect(isTap({ dx: 20, dy: 0, ms: 100 })).toBe(false);
  });
});
