const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Partial-date aware formatter. null → "not established". */
export function fmtDate(s: string | null | undefined): string {
  if (!s) return 'not established';
  const p = s.split('-');
  if (p.length === 1) return p[0];
  if (p.length === 2) return `${MO[+p[1] - 1]} ${p[0]}`;
  return `${MO[+p[1] - 1]} ${+p[2]}, ${p[0]}`;
}

/** Decimal year for a full, month-only or year-only ISO date. Month-only → mid-month; year-only → mid-year. */
export function decYear(s: string | null | undefined): number | null {
  if (!s) return null;
  const p = s.split('-').map(Number);
  return p[0] + ((p[1] || 7) - 1) / 12 + ((p[2] || 15) - 1) / 365;
}

export function gapText(a: number | null, b: number | null): string {
  if (a == null || b == null) return '—';
  const d = b - a;
  if (d < 1 / 12) return `${Math.max(1, Math.round(d * 365.25))} days`;
  if (d < 1) return `${Math.round(d * 12)} mo`;
  return `${d.toFixed(1)} yrs`;
}

/** Piecewise-linear x scale: domain breakpoints → percent positions. */
export function piecewise(domain: number[], range: number[]) {
  return (t: number) => {
    for (let i = 0; i < domain.length - 1; i++) {
      if (t <= domain[i + 1]) return range[i] + (t - domain[i]) / (domain[i + 1] - domain[i]) * (range[i + 1] - range[i]);
    }
    return range[range.length - 1];
  };
}

export const BASIS_LABEL: Record<string, string> = { physical: 'Physical evidence', led_to_remains: 'Led to remains', confession: 'Confession', witness: 'Witness', other: 'Other' };
export const BASIS_VAR: Record<string, string> = { physical: 'var(--P)', led_to_remains: 'var(--L)', confession: 'var(--C)', witness: 'var(--ink2)', other: 'var(--muted)' };

export const STATUS_LABEL: Record<string, string> = {
  convicted: 'Convicted', guilty_plea: 'Pleaded guilty', charged: 'Charged', died_uncharged: 'Died uncharged/untried',
  unidentified: 'Unidentified', named_in_reporting: 'Named in reporting',
};
export const STATUS_COLOR: Record<string, string> = {
  convicted: '#2a78d6', guilty_plea: '#2a78d6', charged: '#7A7C82', died_uncharged: '#1baf7a', unidentified: '#eb6834', named_in_reporting: '#7A7C82',
};
export const HOW_LABEL: Record<string, string> = {
  forensic_science: 'Forensic science', traffic_stop: 'Traffic stop or ticket', survivor_or_witness: 'Survivor or witness',
  records: 'Records & documents', investigation: 'Investigation', surrendered: 'Surrendered', still_open: 'Still open',
};
export const TIER_LABEL: Record<string, string> = {
  convicted_at_trial: 'Convicted at trial', guilty_plea: 'Guilty plea', charged_pending: 'Charged, pending', charged_died_before_trial: 'Charged, died before trial',
  cleared_by_exception: 'Cleared by exception', confessed_uncharged: 'Confessed, uncharged', investigator_attributed: 'Attributed by investigators',
  named_in_reporting: 'Named in reporting', researcher_suspected: 'Suspected by researchers', rumored: 'Rumored',
};
export const TIER_RANK: Record<string, number> = Object.fromEntries(Object.keys(TIER_LABEL).map((k, i) => [k, i + 1]));

export const n = (x: number) => x.toLocaleString('en-US');
export const pct = (a: number, b: number, d = 0) => b ? `${((a / b) * 100).toFixed(d)}%` : '—';
