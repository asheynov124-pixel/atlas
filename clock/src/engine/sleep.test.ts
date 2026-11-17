import { describe, expect, it } from 'vitest';
import { dateKey } from './schedule';
import { lightsOut, previousDateKey, windStreak } from './sleep';

describe('sleep math', () => {
  it('puts lights-out a goal before the wake', () => {
    expect(lightsOut(7, 0, 450)).toEqual({ hour: 23, minute: 30 });
  });

  it('counts a streak through last night when tonight has not started', () => {
    const today = dateKey(new Date(2026, 10, 9));
    const yesterday = previousDateKey(today);
    const before = previousDateKey(yesterday);
    expect(windStreak([yesterday, before], today)).toBe(2);
    expect(windStreak([before], today)).toBe(0);
    expect(windStreak([today, yesterday], today)).toBe(2);
  });
});
