import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useStore, uid } from '../lib/store';
import { normalizeHex, namedColor, hashColor, undertone, lrv, nearestPaint } from '../lib/color';
import { parseIdea } from '../lib/parse';
import type { Custom } from '../lib/types';
import { Button } from './ui';

/** A hex, a picked color, or a short color name is a color. Anything the room can build is an option. The rest is an idea. */
function classify(text: string, picked?: string): Custom['kind'] {
  const t = text.trim();
  if (picked || normalizeHex(t)) return 'color';
  const p = parseIdea(t);
  if (Object.keys(p).length) return 'option';
  if (namedColor(t) && t.split(/\s+/).length <= 3) return 'color';
  return 'idea';
}

export function AddOwn({ onAdded, placeholder = 'A color, a thing to include, or an idea' }: { onAdded?: (c: Custom) => void; placeholder?: string }) {
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<string | undefined>();
  const customs = useStore((s) => s.customs);
  const addCustom = useStore((s) => s.addCustom);
  const removeCustom = useStore((s) => s.removeCustom);

  const kind = classify(text, picked);
  const previewHex = picked ?? normalizeHex(text) ?? (text.trim() ? namedColor(text) ?? undefined : undefined);
  const hint = !text.trim() && !picked ? '' : kind === 'color' ? `A color. ${previewHex ? `${undertone(previewHex)} undertone, LRV ${lrv(previewHex)}, near ${nearestPaint(previewHex).name}.` : ''}` : kind === 'option' ? 'The room can build this.' : 'A note the Ideas page will honor.';

  function submit() {
    const t = text.trim().replace(/\s+/g, ' ');
    if (!t && !picked) return;
    const hex = picked ?? normalizeHex(t) ?? (namedColor(t) ?? undefined);
    const c: Custom = { id: `c-${uid()}`, kind, text: t ? t.slice(0, 80) : (hex ?? 'Custom').toUpperCase(), ...(kind === 'color' ? { hex: hex ?? hashColor(t) } : {}) };
    addCustom(c);
    onAdded?.(c);
    setText(''); setPicked(undefined);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <label className="relative grid size-11 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full border border-line" style={{ background: previewHex ?? 'var(--raised)' }} title="Pick a color">
          <input type="color" className="absolute inset-0 cursor-pointer opacity-0" value={previewHex ?? '#c4a484'} onChange={(e) => setPicked(e.target.value)} />
          {!previewHex && <Plus className="size-4 text-muted" />}
        </label>
        <input className="field" value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
        <Button kind="ghost" onClick={submit} disabled={!text.trim() && !picked}>Add</Button>
      </div>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      {customs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {customs.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-2 rounded-full bg-raised py-1 pr-1 pl-2 text-xs">
              {c.hex && <span className="size-4 rounded-full border border-line" style={{ background: c.hex }} />}
              <span className="max-w-40 truncate">{c.text}</span>
              <button type="button" aria-label="Remove" className="-my-2 grid size-11 place-items-center rounded-full hover:bg-surface" onClick={() => removeCustom(c.id)}><X className="size-3" /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
