import { type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, useEffect, useState, useRef } from 'react';
import { RoomIllustration } from './Illustration';
import { mix as mixHex } from '../lib/color';
import { X } from 'lucide-react';
import { textOn } from '../lib/color';

export function Button({ kind = 'solid', className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'solid' | 'ghost' | 'quiet' | 'danger' }) {
  const k = kind === 'solid' ? 'bg-oak text-ink' : kind === 'ghost' ? 'bg-raised text-fg' : kind === 'danger' ? 'bg-stop/20 text-stop' : 'bg-transparent text-oak';
  return <button type="button" className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium disabled:opacity-50 ${k} ${className}`} {...rest} />;
}

export function Chip({ on, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { on?: boolean }) {
  return <button type="button" aria-pressed={on} className={`min-h-10 shrink-0 rounded-full px-3 text-sm ${on ? 'bg-oak text-ink' : 'bg-raised text-fg'} ${className}`} {...rest} />;
}

export function Kicker({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`kicker ${className}`}>{children}</p>;
}

export function Section({ label, children, hint, className = '' }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-baseline justify-between gap-3"><h2 className="kicker">{label}</h2>{hint && <span className="text-xs text-muted">{hint}</span>}</div>
      {children}
    </section>
  );
}

export function Swatch({ hex, name, selected, onSelect, sub }: { hex: string; name: string; sub?: string; selected?: boolean; onSelect?: () => void }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onSelect} className={`flex min-h-11 items-center gap-2 rounded-full pr-3 text-left text-sm ${selected ? 'bg-oak text-ink' : 'bg-raised text-fg'}`}>
      <span className="ml-1 size-8 shrink-0 rounded-full border border-line" style={{ backgroundColor: hex }} />
      <span className="flex flex-col leading-tight"><span>{name}</span>{sub && <span className={`text-[11px] ${selected ? 'text-ink/70' : 'text-muted'}`}>{sub}</span>}</span>
    </button>
  );
}

export function Dot({ hex, size = 6, title }: { hex: string; size?: number; title?: string }) {
  return <span className={`inline-block rounded-full border border-line size-${size}`} style={{ backgroundColor: hex, width: size * 4, height: size * 4 }} title={title} />;
}

export function Pill({ hex, children }: { hex: string; children: ReactNode }) {
  return <span className="inline-flex items-center gap-2 rounded-full bg-raised py-1 pr-3 pl-1 text-sm"><span className="size-7 rounded-full" style={{ backgroundColor: hex }} />{children}</span>;
}

export function OptionCard({ name, note, selected, onSelect, hex, right }: { name: string; note?: string; selected?: boolean; onSelect?: () => void; hex?: string; right?: ReactNode }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onSelect} className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-left ${selected ? 'bg-oak text-ink' : 'bg-raised text-fg'}`}>
      {hex && <span className="size-9 shrink-0 rounded-xl border border-line" style={{ backgroundColor: hex }} />}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{name}</span>
        {note && <span className={`mt-0.5 block text-xs ${selected ? 'text-ink/75' : 'text-muted'}`}>{note}</span>}
      </span>
      {right && <span className={`shrink-0 text-xs ${selected ? 'text-ink/80' : 'text-muted'}`}>{right}</span>}
    </button>
  );
}

export function Field({ label, suffix, className = '', ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: string; suffix?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      {label && <span className="text-xs text-muted">{label}</span>}
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
    <div className="fixed inset-0 z-40 overflow-y-auto bg-bg/95 backdrop-blur-sm" onClick={onClose}>
      <div className={`mx-auto ${wide ? 'max-w-5xl' : 'max-w-3xl'} pb-16`} onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between bg-bg/95 px-4 py-3">
          <div className="kicker">{title}</div>
          <button type="button" aria-label="Close" onClick={onClose} className="grid size-11 place-items-center rounded-full bg-raised"><X className="size-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-start gap-3 p-6">
      <h3 className="display text-2xl italic">{title}</h3>
      <p className="text-sm text-muted">{body}</p>
      {action}
    </div>
  );
}

export function Note({ level, title, body, action }: { level: 'good' | 'hmm' | 'stop'; title: string; body: string; action?: ReactNode }) {
  const c = level === 'good' ? 'border-good' : level === 'hmm' ? 'border-hmm' : 'border-stop';
  const glyph = level === 'good' ? '●' : level === 'hmm' ? '◐' : '○';
  const col = level === 'good' ? 'text-good' : level === 'hmm' ? 'text-hmm' : 'text-stop';
  return (
    <div className={`rounded-2xl border-l-4 bg-surface p-3 ${c}`}>
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
    <Button kind="ghost" className={className} onClick={() => setArmed(true)}>{icon}{label}</Button>
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
  function save() {
    try { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch { /* ignore */ }
  }
  return (
    <Sheet open onClose={onClose} title={title}>
      <div className="px-4">
        <p className="text-sm text-muted">Copy this into a spreadsheet, a note, or an email to whoever is paying. The download works in a normal browser tab.</p>
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
    <div className="rounded-2xl bg-raised px-3 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 display text-2xl">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}
