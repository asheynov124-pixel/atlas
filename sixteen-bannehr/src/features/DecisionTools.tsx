import { useState } from 'react';
import { setMeta } from '../store/actions';
import { InlineText } from '../edit/InlineText';
import { DECISION_STATUSES, type DecisionStatus } from '../model/types';

function Status({ spreadId, status }: { spreadId: string; status: DecisionStatus }) {
  return (
    <span className="status-pick" role="radiogroup" aria-label="Status">
      {DECISION_STATUSES.map((s) => (
        <button
          key={s.id}
          type="button"
          role="radio"
          aria-checked={status === s.id}
          className={['stamp', 'sc', status === s.id ? 'is-on' : 'is-off'].join(' ')}
          data-status={s.id}
          onClick={() => setMeta(spreadId, 'status', s.id)}
        >
          {s.label}
        </button>
      ))}
    </span>
  );
}

function Choose({ spreadId, itemId, chosen }: { spreadId: string; itemId: string; chosen: boolean }) {
  return (
    <button
      type="button"
      className={['thumb__choose', chosen && 'is-chosen'].filter(Boolean).join(' ')}
      aria-pressed={chosen}
      onClick={() => setMeta(spreadId, 'chosen', chosen ? '' : itemId)}
    >
      {chosen ? '✓ Chosen' : 'Choose'}
    </button>
  );
}

function Field({ spreadId, field, value, placeholder, type }: { spreadId: string; field: string; value: string; placeholder: string; type?: string }) {
  const [v, setV] = useState(value);
  if (type === 'date') {
    return (
      <input
        type="date"
        className="facts__date"
        value={v}
        aria-label="Date"
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== value && setMeta(spreadId, field, v)}
      />
    );
  }
  return <InlineText value={value} onCommit={(next) => setMeta(spreadId, field, next)} placeholder={placeholder} raw label={field} />;
}

export const DecisionTools = { Status, Choose, Field };
