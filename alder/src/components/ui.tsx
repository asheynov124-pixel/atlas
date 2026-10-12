import { type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type ComponentType, useEffect, useState, useRef } from 'react';
import { RoomIllustration } from './Illustration';
import { mix as mixHex } from '../lib/color';
import { saveFile } from '../lib/export';
import { X } from 'lucide-react';
import { textOn } from '../lib/color';

/** solid = the one primary action on a page. accent = the bronze. ghost = secondary. quiet = text link. danger = asks twice elsewhere. */
export function Button({ kind = 'solid', size = 'md', className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'solid' | 'accent' | 'ghost' | 'quiet' | 'danger'; size?: 'md' | 'sm' }) {
  const k = kind === 'solid' ? 'bg-fg text-bg hover:opacity-90'
    : kind === 'accent' ? 'bg-oak text-oakfg hover:opacity-90'
    : kind === 'ghost' ? 'border border-line bg-surface text-fg hover:bg-raised'
    : kind === 'danger' ? 'border border-stop/40 bg-surface text-stop hover:bg-stop/10'
    : 'bg-transparent text-oak hover:underline';
  const s = size === 'sm' ? 'min-h-9 px-3 text-xs' : 'min-h-11 px-4 text-sm';
  return <button type="button" className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${s} ${k} ${className}`} {...rest} />;
}

/** A pill you can press. Used for filters, picks and small option sets. */
export function Chip({ on, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { on?: boolean }) {
  return <button type="button" aria-pressed={on} className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-3.5 text-sm transition-colors ${on ? 'border-fg bg-fg text-bg' : 'border-line bg-surface text-fg hover:bg-raised'} ${className}`} {...rest} />;
}

export function Kicker({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`kicker ${className}`}>{children}</p>;
}

/** The top of every page: what it is, what it is for, what you can do here. */
export function PageHeader({ eyebrow, title, lede, actions, className = '' }: { eyebrow?: string; title: ReactNode; lede?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={`flex flex-col gap-4 md:flex-row md:items-end md:justify-between ${className}`}>
      <div className="min-w-0">
        {eyebrow && <Kicker>{eyebrow}</Kicker>}
        <h1 className="mt-1.5 display text-3xl md:text-4xl">{title}</h1>
        {lede && <p className="lede mt-2">{lede}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export interface TabDef<T extends string> { id: T; label: string; icon?: ComponentType<{ className?: string }>; badge?: string | number; hint?: string }
/** Tabs with icons, so a panel reads at a glance. Scrolls on a phone, wraps on a desk. */
export function TabRail<T extends string>({ tabs, value, onChange, className = '' }: { tabs: TabDef<T>[]; value: T; onChange: (t: T) => void; className?: string }) {
  return (
    <div role="tablist" className={`scroll-row -mx-1 px-1 md:flex-wrap ${className}`}>
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <button key={t.id} role="tab" type="button" aria-selected={on} title={t.hint} onClick={() => onChange(t.id)} className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm transition-colors ${on ? 'bg-fg font-medium text-bg' : 'text-muted hover:bg-raised hover:text-fg'}`}>
            {t.icon && <t.icon className="size-4" />}
            <span>{t.label}</span>
            {t.badge !== undefined && t.badge !== 0 && t.badge !== '' && <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${on ? 'bg-bg/20 text-bg' : 'bg-raised text-fg'}`}>{t.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** A round button that floats over a model or a plan. */
export function IconButton({ on, label, className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { on?: boolean; label: string }) {
  return <button type="button" aria-label={label} title={label} aria-pressed={on} className={`grid size-11 place-items-center rounded-full border shadow-sm transition-colors ${on ? 'border-fg bg-fg text-bg' : 'border-line bg-surface text-fg hover:bg-raised'} ${className}`} {...rest}>{children}</button>;
}

export function Section({ label, children, hint, className = '', action }: { label: string; hint?: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={`flex flex-col gap-3 ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">{label}</h2>
        {hint && <span className="text-xs text-muted">{hint}</span>}
        {action}
      </div>
      {children}
    </section>
  );
}

export function Swatch({ hex, name, selected, onSelect, sub }: { hex: string; name: string; sub?: string; selected?: boolean; onSelect?: () => void }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onSelect} className={`flex min-h-11 items-center gap-2 rounded-full border pr-3 text-left text-sm transition-colors ${selected ? 'border-fg bg-raised' : 'border-line bg-surface hover:bg-raised'}`}>
      <span className="ml-1 size-8 shrink-0 rounded-full border border-line" style={{ backgroundColor: hex }} />
      <span className="flex flex-col leading-tight"><span className={selected ? 'font-medium' : ''}>{name}</span>{sub && <span className="text-[11px] text-muted">{sub}</span>}</span>
    </button>
  );
}

export function Dot({ hex, size = 6, title }: { hex: string; size?: number; title?: string }) {
  return <span className={`inline-block rounded-full border border-line size-${size}`} style={{ backgroundColor: hex, width: size * 4, height: size * 4 }} title={title} />;
}

export function Pill({ hex, children }: { hex: string; children: ReactNode }) {
  return <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface py-1 pr-3 pl-1 text-sm"><span className="size-7 rounded-full border border-line" style={{ backgroundColor: hex }} />{children}</span>;
}

export function OptionCard({ name, note, selected, onSelect, hex, right }: { name: string; note?: string; selected?: boolean; onSelect?: () => void; hex?: string; right?: ReactNode }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onSelect} className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${selected ? 'border-fg bg-raised' : 'border-line bg-surface hover:bg-raised'}`}>
      {hex && <span className="size-9 shrink-0 rounded-lg border border-line" style={{ backgroundColor: hex }} />}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{name}</span>
        {note && <span className="mt-0.5 block text-xs text-muted">{note}</span>}
      </span>
      {right && <span className="shrink-0 text-xs text-muted">{right}</span>}
    </button>
  );
}

export function Field({ label, suffix, className = '', ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: string; suffix?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      {label && <span className="text-xs font-medium text-muted">{label}</span>}
      <span className="relative flex items-center">
        <input className="field" {...rest} />
        {suffix && <span className="pointer-events-none absolute right-3 text-xs text-muted">{suffix}</span>}
      </span>
    </label>
  );
}

export function Sheet({ open, onClose, children, title, wide }: { open: boolean; onClose: () => void; children: ReactNode; title?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-ink/50 backdrop-blur-[2px] md:p-6" onClick={onClose}>
      <div className={`mx-auto min-h-full bg-bg md:min-h-0 md:rounded-2xl md:border md:border-line md:shadow-2xl ${wide ? 'max-w-5xl' : 'max-w-3xl'} pb-10`} onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-bg/95 px-4 py-3 backdrop-blur md:rounded-t-2xl">
          <div className="text-sm font-semibold">{title}</div>
          <button type="button" aria-label="Close" onClick={onClose} className="grid size-11 place-items-center rounded-full border border-line bg-surface hover:bg-raised"><X className="size-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-start gap-3 border-dashed p-6">
      <h3 className="display text-2xl">{title}</h3>
      <p className="text-sm text-muted">{body}</p>
      {action}
    </div>
  );
}

export function Note({ level, title, body, action }: { level: 'good' | 'hmm' | 'stop'; title: string; body: string; action?: ReactNode }) {
  const c = level === 'good' ? 'border-l-good' : level === 'hmm' ? 'border-l-hmm' : 'border-l-stop';
  const glyph = level === 'good' ? '●' : level === 'hmm' ? '◐' : '○';
  const col = level === 'good' ? 'text-good' : level === 'hmm' ? 'text-hmm' : 'text-stop';
  return (
    <div className={`rounded-xl border border-line border-l-4 bg-surface p-3 ${c}`}>
      <p className="flex items-center gap-2 text-sm font-medium"><span className={col}>{glyph}</span>{title}</p>
      <p className="mt-1 text-sm text-muted">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Img({ src, alt = '', className = '', fallback, palette, kind }: { src?: string; alt?: string; className?: string; fallback?: string; palette?: string[]; kind?: string }) {
  const [broken, setBroken] = useState(false);
  const pal = palette ?? (fallback ? [fallback, mixHex(fallback, '#c9a673', 0.3), '#8a6a45', '#3a3632'] : ['#e4d8c4', '#e7dcc8', '#8a6a45', '#3a3632']);
  return (
    <div className={`relative overflow-hidden bg-raised ${className}`}>
      {(!src || broken) && <RoomIllustration palette={pal} kind={kind} />}
      {src && !broken && <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover" onError={() => setBroken(true)} />}
    </div>
  );
}

/** A two-step destructive button: the sandbox never shows confirm() dialogs. */
export function Confirm({ label, confirmLabel = 'Yes, do it', onConfirm, className = '', icon }: { label: string; confirmLabel?: string; onConfirm: () => void; className?: string; icon?: ReactNode }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  return armed ? (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Button kind="danger" onClick={() => { setArmed(false); onConfirm(); }}>{confirmLabel}</Button>
      <Button kind="quiet" onClick={() => setArmed(false)}>Keep it</Button>
    </span>
  ) : (
    <Button kind="ghost" className={className} onClick={() => setArmed(true)} aria-label={label || confirmLabel}>{icon}{label}</Button>
  );
}

/** Shows exported text with a copy button, and tries a download too. Downloads are inert in some viewers. */
export function ExportSheet({ open, onClose, title, filename, content, type = 'text/plain' }: { open: boolean; onClose: () => void; title: string; filename: string; content: string; type?: string }) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  if (!open) return null;
  async function copy() {
    try { await navigator.clipboard.writeText(content); setCopied(true); } catch { ref.current?.select(); document.execCommand?.('copy'); setCopied(true); }
    setTimeout(() => setCopied(false), 2000);
  }
  function save() { void saveFile(filename, content, type); }
  return (
    <Sheet open onClose={onClose} title={title}>
      <div className="px-4 pt-4">
        <p className="text-sm text-muted">Copy this into a spreadsheet, a note, or an email to whoever is paying, or save it as a file.</p>
        <div className="mt-3 flex flex-wrap gap-2"><Button onClick={copy}>{copied ? 'Copied' : 'Copy to clipboard'}</Button><Button kind="ghost" onClick={save}>Download {filename}</Button></div>
        <textarea ref={ref} readOnly className="field mt-3 min-h-[50vh] font-mono text-xs" value={content} onFocus={(e) => e.currentTarget.select()} />
      </div>
    </Sheet>
  );
}

export function Money({ n, currency = 'USD', className = '' }: { n: number; currency?: string; className?: string }) {
  return <span className={`tabular-nums ${className}`}>{new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)}</span>;
}

export function ColorBadge({ hex, children }: { hex: string; children: ReactNode }) {
  return <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: hex, color: textOn(hex) }}>{children}</span>;
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 display text-2xl tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}
