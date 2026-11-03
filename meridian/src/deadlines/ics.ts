/** Minimal RFC 5545 calendar for approved deadlines (imports into Outlook, Apple and Google Calendar). */
export interface IcsEvent { uid: string; date: string; title: string; description: string }

function esc(s: string): string { return s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
function fold(line: string): string { const out: string[] = []; let s = line; while (s.length > 74) { out.push(s.slice(0, 74)); s = ` ${s.slice(74)}`; } out.push(s); return out.join('\r\n'); }

export function toIcs(events: IcsEvent[], calName: string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Meridian//Deadline Engine//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(calName)}`];
  for (const e of events) {
    const day = e.date.replace(/-/g, '');
    const next = new Date(Date.parse(`${e.date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10).replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:${e.uid}@meridian`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${next}`, fold(`SUMMARY:${esc(e.title)}`), fold(`DESCRIPTION:${esc(e.description)}`), 'BEGIN:VALARM', 'TRIGGER:-P7D', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`7 days: ${e.title}`)}`, 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
