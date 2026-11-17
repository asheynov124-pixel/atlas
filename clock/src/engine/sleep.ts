import { dateKey } from './schedule';

export function clockMinutes(hour: number, minute: number): number {
  return hour * 60 + minute;
}

export function fromMinutes(total: number): { hour: number; minute: number } {
  const wrapped = ((total % 1440) + 1440) % 1440;
  return { hour: Math.floor(wrapped / 60), minute: wrapped % 60 };
}

export function lightsOut(wakeHour: number, wakeMinute: number, goalMinutes: number): { hour: number; minute: number } {
  return fromMinutes(clockMinutes(wakeHour, wakeMinute) - goalMinutes);
}

export function windStart(
  bed: { hour: number; minute: number },
  windMinutes: number,
): { hour: number; minute: number } {
  return fromMinutes(clockMinutes(bed.hour, bed.minute) - windMinutes);
}

export function previousDateKey(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  return dateKey(new Date(year, (month ?? 1) - 1, (day ?? 1) - 1));
}

/** Nights in a row ending today, or yesterday if tonight has not been started. */
export function windStreak(dates: string[], today: string): number {
  const have = new Set(dates);
  let cursor = have.has(today) ? today : previousDateKey(today);
  if (!have.has(cursor)) return 0;
  let count = 0;
  while (have.has(cursor)) {
    count += 1;
    cursor = previousDateKey(cursor);
  }
  return count;
}
