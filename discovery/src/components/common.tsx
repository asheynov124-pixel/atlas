import type { ReactNode } from 'react';
import { useStore, activeProfile } from '../state/store';
import { haptic } from '../gestures/haptics';

export function Chip({
  children,
  active,
  tone,
  onClick,
  onRemove,
  title,
}: {
  children: ReactNode;
  active?: boolean;
  tone?: 'accent' | 'like' | 'dislike' | 'save' | 'capture' | 'muted';
  onClick?: () => void;
  onRemove?: () => void;
  title?: string;
}) {
  const cls = `chip${active ? ' chip--active' : ''}${tone ? ` chip--${tone}` : ''}${onClick ? ' chip--button' : ''}`;
  return (
    <span className={cls} title={title}>
      {onClick ? (
        <button type="button" className="chip__body" onClick={onClick}>
          {children}
        </button>
      ) : (
        <span className="chip__body">{children}</span>
      )}
      {onRemove && (
        <button type="button" className="chip__x" aria-label="Remove" onClick={onRemove}>
          ×
        </button>
      )}
    </span>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <label className="toggle-row">
      <span className="toggle-row__text">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </span>
      <input
        type="checkbox"
        className="toggle"
        checked={checked}
        onChange={(e) => {
          haptic('selection');
          onChange(e.target.checked);
        }}
      />
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className={`segmented__item${o.value === value ? ' segmented__item--on' : ''}`}
          onClick={() => {
            haptic('selection');
            onChange(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden="true" />;
}

export function GridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="tile">
          <Skeleton className="tile__thumb" />
          <Skeleton style={{ height: 12, width: '80%', marginTop: 8 }} />
          <Skeleton style={{ height: 10, width: '50%', marginTop: 6 }} />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, body, children }: { icon?: ReactNode; title: string; body?: ReactNode; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty__icon">{icon}</div>}
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {children && <div className="empty__actions">{children}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="empty empty--error" role="alert">
      <div className="empty__icon">⚠︎</div>
      <h3>Something didn’t load</h3>
      <p>{message}</p>
      {onRetry && (
        <div className="empty__actions">
          <button className="btn btn--primary" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-label="Loading" />;
}

export function ProfileBadge({ onClick }: { onClick?: () => void }) {
  const p = useStore(activeProfile);
  const incognito = useStore((s) => s.incognito);
  return (
    <button type="button" className="profile-badge" style={{ ['--pc' as string]: p.color }} onClick={onClick} aria-label={`Profile: ${p.name}`} data-no-gesture>
      <span className="profile-badge__emoji">{incognito ? '🕶️' : p.emoji}</span>
      <span className="profile-badge__name">{incognito ? 'Incognito' : p.name}</span>
    </button>
  );
}

export function Section({ title, action, children }: { title: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <header className="section__head">
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function WeightBar({ value, max = 3 }: { value: number; max?: number }) {
  const pct = Math.min(100, (Math.abs(value) / max) * 100);
  return (
    <span className={`weightbar ${value < 0 ? 'weightbar--neg' : ''}`}>
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}
