/** Bottom sheet with backdrop, drag-to-dismiss, and safe-area padding. */
import { useEffect, useRef, type ReactNode } from 'react';

export function Sheet({
  title,
  subtitle,
  onClose,
  children,
  footer,
  tall,
  className = '',
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  tall?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, dy: 0 };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !ref.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.y);
    ref.current.style.transition = 'none';
    ref.current.style.transform = `translateY(${drag.current.dy}px)`;
  };
  const onUp = () => {
    if (!drag.current || !ref.current) return;
    const { dy } = drag.current;
    drag.current = null;
    ref.current.style.transition = '';
    ref.current.style.transform = '';
    if (dy > 90) onClose();
  };

  return (
    <div className="sheet-root" data-no-gesture>
      <div className="sheet-backdrop" onClick={onClose} />
      <div ref={ref} className={`sheet${tall ? ' sheet--tall' : ''} ${className}`} role="dialog" aria-modal="true" tabIndex={-1}>
        <div className="sheet__grab" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <span />
        </div>
        {(title || subtitle) && (
          <header className="sheet__head">
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </header>
        )}
        <div className="sheet__body">{children}</div>
        {footer && <footer className="sheet__foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function MenuItem({ icon, label, hint, onClick, tone, disabled }: { icon?: ReactNode; label: ReactNode; hint?: ReactNode; onClick: () => void; tone?: 'danger' | 'accent'; disabled?: boolean }) {
  return (
    <button type="button" className={`menu-item${tone ? ` menu-item--${tone}` : ''}`} onClick={onClick} disabled={disabled}>
      {icon && <span className="menu-item__icon">{icon}</span>}
      <span className="menu-item__text">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </span>
    </button>
  );
}
