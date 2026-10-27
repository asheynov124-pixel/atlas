/** Small shared pieces: the gradient mark, empty states, segmented control, toggle rows. */
import { useId, type ReactNode } from 'react';

/** The Night Glass mark: an SVG diamond in the one gradient (no font glyph, so it renders the same everywhere). */
export function Mark({ size = 64, className = 'gate__mark' }: { size?: number; className?: string }) {
  const id = useId();
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      <path d="M32 6 58 32 32 58 6 32z" fill={`url(#${id})`} />
    </svg>
  );
}

export function Empty({ icon, title, body, actions }: { icon: ReactNode; title: string; body: ReactNode; actions?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty__icon" aria-hidden="true">
        {icon}
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
      {actions && <div className="empty__actions">{actions}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id} className={`segmented__item${value === o.id ? ' segmented__item--on' : ''}`} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ToggleRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (on: boolean) => void }) {
  const id = useId();
  return (
    <div className="toggle-row">
      <label className="toggle-row__text" htmlFor={id}>
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </label>
      <input id={id} className="toggle" type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </div>
  );
}
