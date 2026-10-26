import { useState } from 'react';
import { useCompare, MAX_COMPARE } from './Compare';
import { usePrefs } from '../store/prefs';
import { useEditing } from '../reader/context';
import { addItemToSlot, removeItemFromSlot, toggleFavorite } from '../store/actions';
import { requireWho } from '../reader/WhoPrompt';
import { AUTHORS, type Author, type Item } from '../model/types';

/** Hearts (one per person), a compare toggle, and in Edit mode, removal. */
export function ItemExtras({ item, spreadId, compact }: { item: Item; spreadId?: string; compact?: boolean }) {
  const who = usePrefs((s) => s.who);
  const editing = useEditing();
  const inCompare = useCompare((s) => s.ids.includes(item.id));
  const full = useCompare((s) => s.ids.length >= MAX_COMPARE);
  const toggleCompare = useCompare((s) => s.toggle);
  const [confirm, setConfirm] = useState(false);
  const lovers = (Object.keys(AUTHORS) as Author[]).filter((a) => item.favorites[a]);
  const mine = who ? item.favorites[who] : false;

  return (
    <div className={['card__acts', compact && 'card__acts--compact'].filter(Boolean).join(' ')}>
      <button
        type="button"
        className="heart"
        data-author={who ?? undefined}
        aria-pressed={mine}
        aria-label={`${mine ? 'Unfavourite' : 'Favourite'} ${item.name}${who ? ` as ${AUTHORS[who].name}` : ''}`}
        onClick={async () => toggleFavorite(item.id, await requireWho())}
      >
        {mine ? '♥' : '♡'}
      </button>
      <span className="card__loved" aria-label={lovers.length ? `Loved by ${lovers.map((a) => AUTHORS[a].name).join(' and ')}` : undefined}>
        {lovers.map((a) => (
          <span key={a} data-author={a}>
            {compact ? '' : AUTHORS[a].initial}
          </span>
        ))}
      </span>
      <button
        type="button"
        className="card__compare"
        aria-pressed={inCompare}
        disabled={!inCompare && full}
        onClick={() => toggleCompare(item.id)}
        aria-label={`${inCompare ? 'Remove' : 'Add'} ${item.name} ${inCompare ? 'from' : 'to'} comparison`}
        title={!inCompare && full ? 'Three is the most to compare at once' : undefined}
      >
        {compact ? (inCompare ? '☑' : '☐') : inCompare ? '☑ Comparing' : '☐ Compare'}
      </button>
      {editing && spreadId ? (
        confirm ? (
          <button type="button" className="card__remove is-danger" autoFocus onBlur={() => setConfirm(false)} onClick={() => removeItemFromSlot(spreadId, 'items', item.id)}>
            Remove?
          </button>
        ) : (
          <button type="button" className="card__remove" onClick={() => setConfirm(true)} aria-label={`Remove ${item.name}`}>
            ×
          </button>
        )
      ) : null}
    </div>
  );
}

ItemExtras.Add = function Add({ spreadId, label = '+ Add an option' }: { spreadId: string; label?: string }) {
  return (
    <button
      type="button"
      className="add-item"
      onClick={() => addItemToSlot(spreadId, 'items', { name: 'New option', label: 'Photo to come' })}
    >
      {label}
    </button>
  );
};
