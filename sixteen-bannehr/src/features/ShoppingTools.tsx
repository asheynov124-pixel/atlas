import { InlineText } from '../edit/InlineText';
import { addItemToSlot, removeItemFromSlot, updateItem } from '../store/actions';
import { parsePrice } from '../templates/items';
import { useSpread } from '../reader/context';
import { ITEM_STATUSES, type Item, type ItemStatus } from '../model/types';

function Name({ item }: { item: Item }) {
  const { placed } = useSpread();
  return (
    <span className="shop__edit">
      <InlineText className="shop__name" value={item.name} onCommit={(v) => updateItem(item.id, (it) => void (it.name = v || 'Untitled'))} placeholder="Item" />
      <span className="shop__where">
        <InlineText value={item.retailer} onCommit={(v) => updateItem(item.id, (it) => void (it.retailer = v))} placeholder="Retailer" />
        {' · '}
        <InlineText value={item.url} onCommit={(v) => updateItem(item.id, (it) => void (it.url = v))} placeholder="Link" raw inputMode="url" />
        <button type="button" className="shop__remove" onClick={() => removeItemFromSlot(placed.spread.id, 'items', item.id)} aria-label={`Remove ${item.name}`}>
          Remove
        </button>
      </span>
    </span>
  );
}

function Status({ item }: { item: Item }) {
  return (
    <select
      className="shop__select"
      value={item.status}
      aria-label={`Status of ${item.name}`}
      onChange={(e) => updateItem(item.id, (it) => void (it.status = e.target.value as ItemStatus))}
    >
      {ITEM_STATUSES.map((s) => (
        <option key={s.id} value={s.id}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

function Price({ item }: { item: Item }) {
  return (
    <InlineText
      value={item.price === null ? '' : String(item.price)}
      onCommit={(v) => updateItem(item.id, (it) => void (it.price = parsePrice(v)))}
      placeholder="—"
      raw
      inputMode="decimal"
      label={`Price of ${item.name}`}
    />
  );
}

function Add({ spreadId }: { spreadId: string }) {
  return (
    <button type="button" className="add-item" onClick={() => addItemToSlot(spreadId, 'items', { name: 'New item', status: 'to-buy', label: 'Photo to come' })}>
      + Add an item
    </button>
  );
}

export const ShoppingTools = { Name, Status, Price, Add };
