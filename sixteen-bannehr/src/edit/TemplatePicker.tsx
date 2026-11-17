import { useEffect, useRef } from 'react';
import { PICKABLE_TEMPLATES } from '../model/templates';
import type { TemplateId } from '../model/types';

/** A schematic of a template, drawn in CSS: what the spread looks like at a glance. */
export function TemplateGlyph({ template }: { template: TemplateId }) {
  return (
    <span className={`glyph glyph--${template}`} aria-hidden="true">
      <span className="glyph__l" />
      <span className="glyph__r" />
    </span>
  );
}

export function TemplatePicker({
  title,
  current,
  onPick,
  onClose,
}: {
  title: string;
  current?: TemplateId;
  onPick: (t: TemplateId) => void;
  onClose: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    root.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="picker" role="dialog" aria-label={title} ref={root}>
      <p className="picker__title">{title}</p>
      <ul className="picker__grid">
        {PICKABLE_TEMPLATES.map((t) => (
          <li key={t.id}>
            <button type="button" onClick={() => onPick(t.id)} disabled={t.id === current} aria-current={t.id === current || undefined}>
              <TemplateGlyph template={t.id} />
              <span className="picker__name">{t.name}</span>
              <span className="picker__blurb">{t.blurb}</span>
            </button>
          </li>
        ))}
      </ul>
      {current ? <p className="picker__note">Words and photos carry over wherever the new template has a place for them; nothing is lost if you switch back.</p> : null}
      <button type="button" className="picker__close" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
