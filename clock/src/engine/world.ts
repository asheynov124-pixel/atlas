export function cityLabel(timeZone: string): string {
  const tail = timeZone.split('/').pop() ?? timeZone;
  return tail.replaceAll('_', ' ');
}

function parts(utcMs: number, timeZone: string, opts: Intl.DateTimeFormatOptions): Record<string, string> {
  const formatted = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', ...opts }).formatToParts(
    new Date(utcMs),
  );
  return Object.fromEntries(formatted.map((part) => [part.type, part.value]));
}

export function timeZoneOffsetMs(timeZone: string, utcMs: number): number {
  const read = parts(utcMs, timeZone, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const hour = read.hour === '24' ? 0 : Number(read.hour);
  const asUtc = Date.UTC(Number(read.year), Number(read.month) - 1, Number(read.day), hour, Number(read.minute), Number(read.second));
  return asUtc - utcMs;
}

export function ymdInZone(utcMs: number, timeZone: string): { y: number; m: number; d: number } {
  const read = parts(utcMs, timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return { y: Number(read.year), m: Number(read.month), d: Number(read.day) };
}

export function zonedWallToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const utc = guess - timeZoneOffsetMs(timeZone, guess);
  return guess - timeZoneOffsetMs(timeZone, utc);
}

export function wallToUtc(timeZone: string, now: number, minuteOfDay: number): number {
  const { y, m, d } = ymdInZone(now, timeZone);
  const minute = ((minuteOfDay % 1440) + 1440) % 1440;
  return zonedWallToUtc(timeZone, y, m, d, Math.floor(minute / 60), minute % 60);
}

export function workWindowUtc(
  timeZone: string,
  now: number,
  startHour = 9,
  endHour = 17,
): { start: number; end: number } {
  const { y, m, d } = ymdInZone(now, timeZone);
  return {
    start: zonedWallToUtc(timeZone, y, m, d, startHour, 0),
    end: zonedWallToUtc(timeZone, y, m, d, endHour, 0),
  };
}

export function sharedWorkWindow(zones: string[], now: number): { start: number; end: number } | null {
  if (zones.length < 2) return null;
  const ranges = zones.map((zone) => workWindowUtc(zone, now));
  const start = Math.max(...ranges.map((range) => range.start));
  const end = Math.min(...ranges.map((range) => range.end));
  if (end <= start) return null;
  return { start, end };
}

export function minuteOfDay(utcMs: number, timeZone: string): number {
  const read = parts(utcMs, timeZone, { hour: '2-digit', minute: '2-digit' });
  const hour = read.hour === '24' ? 0 : Number(read.hour);
  return hour * 60 + Number(read.minute);
}
