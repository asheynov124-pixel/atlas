/**
 * Game time. Sim runs in whole days; visuals (sun, clouds) run on `timeOfDay` (FOUNDATION).
 * speed index: 0 pause · 1 normal · 2 fast · 3 faster · 4 ludicrous.
 */
export const DAYS_PER_SECOND = [0, 0.5, 1.5, 4, 12];
/** visual day-cycle multiplier per speed */
export const VISUAL_SPEED = [0, 1, 2, 3.5, 6];
export const DAYS_PER_MONTH = 30;
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const START_YEAR = 2350;

export class Clock {
  /** game days elapsed (float) */
  day = 0;
  speed = 1;
  /** speed before pausing (for toggle) */
  lastSpeed = 1;
  /** 0..1 visual time of day on the active planet; 0.25 = local noon at longitude 0 */
  timeOfDay = 0.3;
  /** real seconds since boot (shader time) */
  time = 0;
  private acc = 0;

  /** Advance; returns how many whole sim days elapsed this frame (capped). */
  advance(dt: number, dayLength: number): number {
    this.time += dt;
    const s = this.speed;
    this.timeOfDay = (this.timeOfDay + (dt * VISUAL_SPEED[s]) / Math.max(10, dayLength)) % 1;
    this.acc += dt * DAYS_PER_SECOND[s];
    let days = 0;
    while (this.acc >= 1 && days < 8) {
      this.acc -= 1;
      days++;
    }
    if (days === 8) this.acc = Math.min(this.acc, 1);
    this.day += days;
    return days;
  }

  /** fraction of the current day elapsed (for smooth sim interpolation) */
  get dayFraction(): number {
    return this.acc;
  }

  setSpeed(s: number): void {
    const v = Math.max(0, Math.min(4, Math.round(s)));
    if (v > 0) this.lastSpeed = v;
    this.speed = v;
  }

  togglePause(): void {
    this.setSpeed(this.speed === 0 ? this.lastSpeed || 1 : 0);
  }

  get month(): number {
    return Math.floor(this.day / DAYS_PER_MONTH) % 12;
  }
  get year(): number {
    return START_YEAR + Math.floor(this.day / (DAYS_PER_MONTH * 12));
  }
  get dayOfMonth(): number {
    return (Math.floor(this.day) % DAYS_PER_MONTH) + 1;
  }
  label(): string {
    return `${MONTHS[this.month]} ${this.dayOfMonth}, ${this.year}`;
  }
}
