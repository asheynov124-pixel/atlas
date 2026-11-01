import type { TemplateId } from '@/book/types';

/** A tiny schematic of each template for the thumbnail strip and the template picker. */
export function Glyph({ template, accent = 'var(--accent, var(--sage))' }: { template: TemplateId; accent?: string }) {
  const ink = 'var(--muted)';
  const paper = 'var(--paper)';
  const line = (x: number, y: number, w: number, h = 1.2) => <rect x={x} y={y} width={w} height={h} fill={ink} opacity="0.55" />;
  const body = (() => {
    switch (template) {
      case 'cover':
        return (<><rect width="60" height="40" fill={accent} /><rect x="6" y="24" width="18" height="3" fill={paper} /><rect x="6" y="29" width="12" height="1.5" fill={paper} opacity="0.8" /></>);
      case 'endpapers':
        return (<><rect width="60" height="40" fill="var(--sage)" /><rect x="34" y="15" width="18" height="1.5" fill={paper} opacity="0.8" /></>);
      case 'contents':
        return (<>{[8, 13, 18, 23, 28].map((y) => <g key={y}>{line(6, y, 16)}{line(24, y, 3)}</g>)}{[8, 13, 18].map((y) => <g key={y}>{line(36, y, 16)}{line(54, y, 3)}</g>)}</>);
      case 'opener':
        return (<><rect width="60" height="40" fill={accent} /><rect x="6" y="7" width="3" height="11" fill={paper} /><rect x="6" y="30" width="16" height="2.4" fill={paper} /></>);
      case 'essay':
        return (<>{line(6, 8, 18, 2.6)}{[14, 17, 20, 23, 26].map((y) => <g key={y}>{line(6, y, 8)}{line(16, y, 8)}</g>)}{line(36, 10, 16, 2)}{line(36, 14, 12, 2)}<rect x="42" y="24" width="12" height="9" fill={accent} /></>);
      case 'fullbleed':
        return (<><rect width="60" height="40" fill={accent} /><rect x="0" y="30" width="18" height="6" fill={paper} /></>);
      case 'beforeafter':
        return (<><rect x="4" y="6" width="52" height="28" fill={accent} opacity="0.55" /><rect x="4" y="6" width="26" height="28" fill={accent} /><rect x="29.5" y="4" width="1" height="32" fill={paper} /></>);
      case 'gallery':
        return (<>{[6, 23, 36, 47].map((x) => [8, 22].map((y) => <rect key={`${x}${y}`} x={x} y={y} width={x < 30 ? 9 : 9} height="9" fill={accent} />))}</>);
      case 'moodboard':
        return (<><rect x="6" y="7" width="18" height="14" fill={accent} transform="rotate(-3 15 14)" /><rect x="30" y="8" width="6" height="6" fill="var(--oak)" /><rect x="38" y="8" width="6" height="6" fill="var(--olive)" /><rect x="32" y="20" width="16" height="10" fill="#f3d9cc" transform="rotate(2 40 25)" />{line(10, 27, 12)}</>);
      case 'pins':
        return (<><rect x="6" y="7" width="22" height="26" fill={accent} /><circle cx="12" cy="14" r="2" fill={paper} /><circle cx="22" cy="24" r="2" fill={paper} />{[9, 15, 21, 27].map((y) => line(36, y, 16))}</>);
      case 'palette':
        return (<>{[['var(--sage)', 6], ['var(--olive)', 22], ['var(--oak)', 38]].map(([c, x]) => <rect key={String(x)} x={Number(x)} y="8" width="14" height="11" fill={String(c)} />)}{[6, 22, 38].map((x) => line(x, 23, 10))}{[6, 22, 38].map((x) => line(x, 27, 7))}</>);
      case 'decision':
        return (<><rect x="6" y="9" width="22" height="16" fill={accent} />{line(6, 28, 16)}{[36, 46].map((x) => [9, 20].map((y) => <rect key={`${x}${y}`} x={x} y={y} width="8" height="8" fill={accent} opacity="0.6" />))}</>);
      case 'shopping':
        return (<>{[9, 14, 19, 24, 29].map((y) => <g key={y}>{line(6, y, 14)}{line(22, y, 5)}</g>)}<rect x="36" y="22" width="18" height="2.4" fill={ink} opacity="0.8" /><rect x="36" y="27" width="18" height="2.4" fill={ink} opacity="0.8" /></>);
      case 'stilltodecide':
        return (<>{[9, 15, 21, 27].map((y) => line(6, y, 20))}{[9, 15, 21].map((y) => line(36, y, 14))}</>);
    }
  })();
  return (
    <svg viewBox="0 0 60 40" width="100%" height="100%" aria-hidden="true" style={{ display: 'block', background: 'var(--paper)' }}>
      {body}
    </svg>
  );
}
