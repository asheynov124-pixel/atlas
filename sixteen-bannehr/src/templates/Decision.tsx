import { Editable, Page, Picture } from './kit';
import { useSpread, useEditing } from '../reader/context';
import { setSlotText, useBook } from '../store/book';
import { useItems, priceLabel } from './items';
import { DecisionTools } from '../features/DecisionTools';
import { ImageTools } from '../edit/ImageTools';
import { ItemExtras } from '../features/ItemExtras';
import { DECISION_STATUSES, type DecisionStatus, type MetaSlot, type TextSlot } from '../model/types';

export function statusLabel(s: string): string {
  return DECISION_STATUSES.find((d) => d.id === s)?.label ?? 'Thinking';
}

export function Stamp({ status }: { status: string }) {
  return (
    <span className="stamp sc" data-status={status || 'thinking'}>
      {statusLabel(status)}
    </span>
  );
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** The options we considered, the one we chose, and why. */
export function Decision() {
  const { placed, layout } = useSpread();
  const editing = useEditing();
  const book = useBook();
  const { spread } = placed;
  const options = useItems(spread);
  const meta = (spread.slots.meta as MetaSlot | undefined)?.values ?? {};
  const status = (meta.status || 'thinking') as DecisionStatus;
  const chosen = meta.chosen ? book.items[meta.chosen] : null;
  const html = (k: string) => (spread.slots[k] as TextSlot | undefined)?.html ?? '';

  const header = (
    <header className="decision__head">
      <p className="decision__kicker">
        <span className="sc">Decision</span>
        {editing ? <DecisionTools.Status spreadId={spread.id} status={status} /> : <Stamp status={status} />}
      </p>
      <Editable as="h2" single className="decision__title" html={html('title')} onCommit={(h) => setSlotText(spread.id, 'title', h)} placeholder="What is being decided" />
    </header>
  );

  const thumbs = (
    <section className="decision__options" aria-label="Options considered">
      <p className="sc decision__sub">
        {options.length ? `Considered · ${options.length}` : 'Nothing considered yet'}
      </p>
      <ul className={['thumbs', options.length > 8 && 'thumbs--dense'].filter(Boolean).join(' ')}>
        {options.map((it, i) => (
          <li key={it.id} className={['thumb', chosen?.id === it.id && 'is-chosen'].filter(Boolean).join(' ')}>
            <div className="thumb__img">
              <Picture assetId={it.assetId} focal={it.focal} label="" alt={it.name} slip="none">
                {editing ? <ImageTools target={{ kind: 'item', itemId: it.id }} compact /> : null}
              </Picture>
            </div>
            <span className="thumb__name">
              <span className="thumb__no">{String(i + 1).padStart(2, '0')}</span> {it.name}
            </span>
            {editing ? <DecisionTools.Choose spreadId={spread.id} itemId={it.id} chosen={chosen?.id === it.id} /> : null}
          </li>
        ))}
      </ul>
      {editing ? <ItemExtras.Add spreadId={spread.id} label="+ Add an option" /> : null}
    </section>
  );

  const choice = (
    <section className="decision__choice" aria-label="The choice">
      <div className="decision__plate">
        {chosen ? (
          <Picture assetId={chosen.assetId} focal={chosen.focal} label={chosen.label} alt={chosen.name} slip="bl" />
        ) : (
          <div className="decision__undecided">
            <span className="decision__undecided-mark" aria-hidden="true">
              ?
            </span>
            <span className="sc">{status === 'thinking' ? 'Still thinking' : 'Choice not marked yet'}</span>
          </div>
        )}
      </div>
      <p className="sc decision__sub">The choice</p>
      <h3 className="decision__chosen">{chosen ? chosen.name : status === 'thinking' ? 'Not yet' : 'Unmarked'}</h3>
      <Editable as="div" className="decision__why" html={html('body')} onCommit={(h) => setSlotText(spread.id, 'body', h)} placeholder="Why this one?" />
      <dl className="facts">
        <div>
          <dt className="sc">Status</dt>
          <dd>{statusLabel(status)}</dd>
        </div>
        <div>
          <dt className="sc">Cost</dt>
          <dd>{editing ? <DecisionTools.Field spreadId={spread.id} field="cost" value={meta.cost ?? ''} placeholder="$0" /> : meta.cost || (chosen && priceLabel(chosen)) || '—'}</dd>
        </div>
        <div>
          <dt className="sc">Date</dt>
          <dd>{editing ? <DecisionTools.Field spreadId={spread.id} field="date" value={meta.date ?? ''} placeholder="" type="date" /> : formatDate(meta.date ?? '') || '—'}</dd>
        </div>
      </dl>
    </section>
  );

  if (layout === 'phone') {
    return (
      <>
        <Page side="verso">
          {header}
          {choice}
        </Page>
        <Page side="recto" empty={!options.length}>
          {thumbs}
        </Page>
      </>
    );
  }

  return (
    <>
      <Page side="verso">
        <div className="decision__verso">
          {header}
          {thumbs}
        </div>
      </Page>
      <Page side="recto">{choice}</Page>
    </>
  );
}
