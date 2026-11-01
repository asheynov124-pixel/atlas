import type { CleanFields } from '@/book/types';
import { CLEAN_LABEL } from '@/book/words';
import controls from '@/editor/controls.module.css';

const FIELDS: Array<[keyof Omit<CleanFields, 'notes'>, string]> = [
  ['construction', 'Solid wood or composite'],
  ['formaldehyde', 'Formaldehyde standard'],
  ['voc', 'Finish VOC level'],
  ['pvcFree', 'PVC'],
  ['leadFree', 'Lead-free (water fixtures)'],
];

/**
 * The Clean materials panel as data entry. "Unknown" is a valid answer for
 * every field; nothing is prefilled and nothing is inferred.
 */
export function CleanFieldsEditor({ value, onChange }: { value: CleanFields; onChange: (patch: Partial<CleanFields>) => void }) {
  return (
    <div className={controls.cleanGrid}>
      <p className="t-label" style={{ color: 'var(--accent, var(--muted))' }}>Clean materials</p>
      {FIELDS.map(([key, label]) => (
        <label key={key} className={controls.cleanRow}>
          <span className="t-label">{label}</span>
          <select className={controls.select} value={value[key]} onChange={(e) => onChange({ [key]: e.target.value } as Partial<CleanFields>)}>
            {Object.entries(CLEAN_LABEL[key]).map(([v, text]) => (
              <option key={v} value={v}>{text}</option>
            ))}
          </select>
        </label>
      ))}
      <label className={controls.field}>
        <span className="t-label">Notes</span>
        <input className={controls.input} value={value.notes} placeholder="Where you checked, what the sheet said" onChange={(e) => onChange({ notes: e.target.value })} />
      </label>
    </div>
  );
}
