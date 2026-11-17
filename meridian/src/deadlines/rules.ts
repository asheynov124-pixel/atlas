/**
 * New Jersey Court Rules deadline table and R. 1:3-1 time computation.
 *
 * R. 1:3-1: the day of the act or event is not counted; the last day is counted unless it
 * is a Saturday, Sunday or legal holiday, in which case the period runs to the next day
 * that is not; periods of less than 7 days exclude Saturdays, Sundays and legal holidays.
 *
 * Every rule carries its citation and a "verify" flag. This is a second set of eyes on
 * the docket, not the calendar of record: confirm each entry against the current Rules,
 * any court order, and the Judiciary's published holiday schedule.
 */

export type TriggerKind = 'complaint_served' | 'interrogatories_served' | 'document_requests_served' | 'admissions_served' | 'final_judgment_entered' | 'order_served' | 'sj_return_date' | 'motion_return_date' | 'contract_event';

export interface Rule {
  id: string; label: string; cite: string; trigger: TriggerKind; days: number; direction: 'after' | 'before';
  description: string; verify: string; contractual?: boolean;
}

export const RULES: Rule[] = [
  { id: 'answer', label: 'Answer to complaint', cite: 'R. 4:6-1(a)', trigger: 'complaint_served', days: 35, direction: 'after', description: 'Serve an answer within 35 days after service of the summons and complaint.', verify: 'Check for a consent extension or a court order shortening or enlarging time.' },
  { id: 'interrogatories', label: 'Answers to interrogatories', cite: 'R. 4:17-4(b)', trigger: 'interrogatories_served', days: 60, direction: 'after', description: 'Serve answers within 60 days after service of the interrogatories.', verify: 'Confirm the service date and any case management order.' },
  { id: 'documents', label: 'Response to document requests', cite: 'R. 4:18-1(b)(2)', trigger: 'document_requests_served', days: 35, direction: 'after', description: 'Serve a written response within 35 days after service of the request.', verify: 'Confirm the service date and any case management order.' },
  { id: 'admissions', label: 'Response to requests for admission', cite: 'R. 4:22-1', trigger: 'admissions_served', days: 30, direction: 'after', description: 'Matters are deemed admitted unless answered or objected to within 30 days after service.', verify: 'Deemed admissions are unforgiving. Confirm the service date.' },
  { id: 'appeal', label: 'Notice of appeal (final judgment)', cite: 'R. 2:4-1(a)', trigger: 'final_judgment_entered', days: 45, direction: 'after', description: 'File a notice of appeal within 45 days of entry of the final judgment.', verify: 'Tolling motions under R. 2:4-3 change this date.' },
  { id: 'reconsideration', label: 'Motion for reconsideration', cite: 'R. 4:49-2', trigger: 'order_served', days: 20, direction: 'after', description: 'Serve the motion not later than 20 days after service of the judgment or order.', verify: 'Applies to final judgments and orders; interlocutory orders follow R. 4:42-2.' },
  { id: 'sj_motion', label: 'Serve summary judgment motion', cite: 'R. 4:46-1', trigger: 'sj_return_date', days: 28, direction: 'before', description: 'Serve the motion, brief and statement of material facts at least 28 days before the return date.', verify: 'The motion must also be returnable at least 30 days before the trial date.' },
  { id: 'sj_opposition', label: 'Serve opposition to summary judgment', cite: 'R. 4:46-1', trigger: 'sj_return_date', days: 10, direction: 'before', description: 'Serve opposing papers, including the responding statement under R. 4:46-2(b), not later than 10 days before the return date.', verify: 'Confirm the return date has not been adjourned.' },
  { id: 'sj_reply', label: 'Serve reply on summary judgment', cite: 'R. 4:46-1', trigger: 'sj_return_date', days: 4, direction: 'before', description: 'Serve reply papers not later than 4 days before the return date. Under 7 days, so weekends and holidays are not counted.', verify: 'Confirm the return date has not been adjourned.' },
  { id: 'motion_opposition', label: 'Serve opposition to motion', cite: 'R. 1:6-3(a)', trigger: 'motion_return_date', days: 8, direction: 'before', description: 'Serve opposition not later than 8 days before the return date.', verify: 'Confirm whether the motion is governed by a more specific rule.' },
  { id: 'motion_reply', label: 'Serve reply on motion', cite: 'R. 1:6-3(a)', trigger: 'motion_return_date', days: 4, direction: 'before', description: 'Serve reply papers not later than 4 days before the return date.', verify: 'Confirm whether the motion is governed by a more specific rule.' },
];

export function ruleById(id: string): Rule | undefined { return RULES.find((r) => r.id === id); }

// ---------------------------------------------------------------- holidays

function d(y: number, m: number, day: number): Date { return new Date(Date.UTC(y, m - 1, day)); }
function nthWeekday(y: number, m: number, weekday: number, n: number): Date {
  const first = d(y, m, 1);
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return d(y, m, 1 + offset + (n - 1) * 7);
}
function lastWeekday(y: number, m: number, weekday: number): Date {
  const last = d(y, m + 1, 0);
  return d(y, m, last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7));
}
function easter(y: number): Date {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, dd = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - dd - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return d(y, month, day);
}
function observed(dt: Date): Date {
  const w = dt.getUTCDay();
  if (w === 6) return new Date(dt.getTime() - 86_400_000);
  if (w === 0) return new Date(dt.getTime() + 86_400_000);
  return dt;
}
export function iso(dt: Date): string { return dt.toISOString().slice(0, 10); }
export function parseIso(s: string): Date { const [y, m, day] = s.split('-').map(Number); return d(y!, m!, day!); }
export function pretty(dt: Date): string { return dt.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }); }

/** New Jersey state court holidays (observed). Verify against the Judiciary's annual schedule. */
export function njCourtHolidays(year: number): Map<string, string> {
  const goodFriday = new Date(easter(year).getTime() - 2 * 86_400_000);
  const election = (() => { const firstMon = nthWeekday(year, 11, 1, 1); return new Date(firstMon.getTime() + 86_400_000); })();
  const list: Array<[Date, string]> = [
    [observed(d(year, 1, 1)), "New Year's Day"],
    [nthWeekday(year, 1, 1, 3), 'Martin Luther King Jr. Day'],
    [observed(d(year, 2, 12)), "Lincoln's Birthday"],
    [nthWeekday(year, 2, 1, 3), "Presidents' Day"],
    [goodFriday, 'Good Friday'],
    [lastWeekday(year, 5, 1), 'Memorial Day'],
    [observed(d(year, 6, 19)), 'Juneteenth'],
    [observed(d(year, 7, 4)), 'Independence Day'],
    [nthWeekday(year, 9, 1, 1), 'Labor Day'],
    [nthWeekday(year, 10, 1, 2), 'Columbus Day'],
    [election, 'General Election Day'],
    [observed(d(year, 11, 11)), 'Veterans Day'],
    [nthWeekday(year, 11, 4, 4), 'Thanksgiving'],
    [observed(d(year, 12, 25)), 'Christmas'],
  ];
  return new Map(list.map(([dt, name]) => [iso(dt), name]));
}

export function closedReason(dt: Date): string | null {
  const w = dt.getUTCDay();
  if (w === 6) return 'Saturday';
  if (w === 0) return 'Sunday';
  return njCourtHolidays(dt.getUTCFullYear()).get(iso(dt)) ?? null;
}

// ---------------------------------------------------------------- computation

export interface MathStep { text: string; date?: string }
export interface Computed { rule_id: string; label: string; cite: string; due: string; due_pretty: string; steps: MathStep[]; warnings: string[]; verify: string }

const addDays = (dt: Date, n: number) => new Date(dt.getTime() + n * 86_400_000);

export function compute(rule: Rule, triggerIso: string, opts: { mail_service?: boolean; trigger_label?: string; source_cite?: string } = {}): Computed {
  const steps: MathStep[] = [];
  const warnings: string[] = [];
  const t = parseIso(triggerIso);
  steps.push({ text: `Trigger: ${opts.trigger_label ?? rule.trigger.replace(/_/g, ' ')} on ${pretty(t)}${opts.source_cite ? ` (${opts.source_cite})` : ''}.`, date: triggerIso });
  const tClosed = rule.direction === 'before' ? closedReason(t) : null;
  if (tClosed && tClosed !== 'Saturday' && tClosed !== 'Sunday') warnings.push(`The return date itself falls on ${tClosed}, when the courts are closed. Confirm the return date with chambers.`);
  let days = rule.days;
  if (opts.mail_service && rule.direction === 'after') {
    days += 3;
    steps.push({ text: `Served by mail: 3 days added under R. 1:3-3 (${rule.days} + 3 = ${days}). Verify that the paper was in fact served by mail.` });
  }
  let cur = t;
  if (rule.direction === 'after') {
    steps.push({ text: 'R. 1:3-1: the day of the event is not counted.' });
    if (days < 7) {
      let n = 0;
      while (n < days) { cur = addDays(cur, 1); const why = closedReason(cur); if (why) steps.push({ text: `Skipped ${pretty(cur)} (${why}): periods under 7 days exclude weekends and holidays.` }); else n++; }
      steps.push({ text: `Counted ${days} court days forward to ${pretty(cur)}.`, date: iso(cur) });
    } else {
      cur = addDays(t, days);
      steps.push({ text: `Added ${days} calendar days: ${pretty(cur)}.`, date: iso(cur) });
      let why = closedReason(cur);
      while (why) {
        const next = addDays(cur, 1);
        steps.push({ text: `${pretty(cur)} is a ${why === 'Saturday' || why === 'Sunday' ? why : `court holiday (${why})`}, so the period runs to the next day: ${pretty(next)}.`, date: iso(next) });
        cur = next;
        why = closedReason(cur);
      }
    }
  } else {
    steps.push({ text: 'Counting back from the return date, which is not itself counted.' });
    if (days < 7) {
      let n = 0;
      while (n < days) { cur = addDays(cur, -1); const why = closedReason(cur); if (why) steps.push({ text: `Skipped ${pretty(cur)} (${why}): periods under 7 days exclude weekends and holidays.` }); else n++; }
      steps.push({ text: `Counted ${days} court days back to ${pretty(cur)}.`, date: iso(cur) });
    } else {
      cur = addDays(t, -days);
      steps.push({ text: `Counted back ${days} calendar days: ${pretty(cur)}.`, date: iso(cur) });
      let why = closedReason(cur);
      while (why) {
        const prev = addDays(cur, -1);
        steps.push({ text: `${pretty(cur)} is a ${why === 'Saturday' || why === 'Sunday' ? why : `court holiday (${why})`}. R. 1:3-1 speaks to periods counted forward, so this moves to the earlier business day to stay safe: ${pretty(prev)}.`, date: iso(prev) });
        warnings.push('Backward-counted deadline landed on a closed day and was moved earlier as a precaution. Verify.');
        cur = prev;
        why = closedReason(cur);
      }
    }
  }
  steps.push({ text: `Due: ${pretty(cur)}. ${rule.cite}: ${rule.description}` , date: iso(cur) });
  return { rule_id: rule.id, label: rule.label, cite: rule.cite, due: iso(cur), due_pretty: pretty(cur), steps, warnings, verify: rule.verify };
}

/** Contract deadlines: plain calendar arithmetic, flagged to check the agreement's own computation clause. */
export function computeContract(label: string, days: number, triggerIso: string, opts: { trigger_label?: string; source_cite?: string; clause?: string } = {}): Computed {
  const t = parseIso(triggerIso);
  const due = addDays(t, days);
  const steps: MathStep[] = [
    { text: `Trigger: ${opts.trigger_label ?? 'contract event'} on ${pretty(t)}${opts.source_cite ? ` (${opts.source_cite})` : ''}.`, date: triggerIso },
    { text: `${opts.clause ?? 'The agreement'} sets ${days} days. Added ${days} calendar days, not counting the trigger day: ${pretty(due)}.`, date: iso(due) },
  ];
  const warnings = ['Contract deadline: the Court Rules do not govern it. Check the agreement for its own computation, notice and business-day provisions.'];
  const why = closedReason(due);
  if (why) warnings.push(`${pretty(due)} is a ${why}. Whether that moves the date depends on the agreement.`);
  steps.push({ text: `Due: ${pretty(due)}.`, date: iso(due) });
  return { rule_id: 'contract', label, cite: opts.clause ?? 'Contract', due: iso(due), due_pretty: pretty(due), steps, warnings, verify: 'Read the clause and confirm which event starts the clock.' };
}
