import { describe, expect, it } from 'vitest';
import { cityLabel, sharedWorkWindow, wallToUtc } from './world';

describe('world compare', () => {
  const now = Date.UTC(2026, 10, 9, 15, 0, 0);

  it('finds the shared 9-to-5 between New York and London in November', () => {
    const shared = sharedWorkWindow(['America/New_York', 'Europe/London'], now);
    expect(shared).toEqual({
      start: Date.UTC(2026, 10, 9, 14, 0, 0),
      end: Date.UTC(2026, 10, 9, 17, 0, 0),
    });
  });

  it('reports no shared working hours when the windows do not meet', () => {
    expect(sharedWorkWindow(['America/New_York', 'Asia/Tokyo'], now)).toBeNull();
  });

  it('moves every city from one wall-clock minute', () => {
    const instant = wallToUtc('Europe/London', now, 9 * 60);
    expect(instant).toBe(Date.UTC(2026, 10, 9, 9, 0, 0));
    expect(cityLabel('America/New_York')).toBe('New York');
  });
});
