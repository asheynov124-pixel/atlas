import { useState, type CSSProperties } from 'react';
import { isSlotKind, stripHtml } from '@/book/slots';
import type { DecisionStatus, Item } from '@/book/types';
import { fmtDate, money, STATUS_LABEL } from '@/book/words';
import { ItemImage } from '@/reader/ItemImage';
import { RichText } from '@/reader/RichText';
import { Page, Spread } from '@/reader/Spread';
import type { SpreadCtx } from '@/reader/SpreadContext';
import { addDecisionOption, chooseOption, patchDecision, removeDecisionOption, setDecisionWhy } from '@/state/actions';
import { ItemPicker } from '@/features/ItemPicker';
import controls from '@/editor/controls.module.css';
import features from '@/features/features.module.css';
import shared from '../shared.module.css';
import styles from './Decision.module.css';

const STATUSES: DecisionStatus[] = ['thinking', 'decided', 'ordered', 'installed'];

export function DecisionTemplate({ ctx }: { ctx: SpreadCtx }) {
  const { slots } = ctx.ref.spread;
  const spreadId = ctx.ref.spread.id;
  const title = isSlotKind(slots.title, 'text') ? slots.title.html : '';
  const d = isSlotKind(slots.decision, 'decision') ? slots.decision : null;
  const options = (d?.optionIds ?? []).map((id) => ctx.book.items[id]).filter((i): i is Item => !!i);
  const chosen = d?.chosenId ? ctx.book.items[d.chosenId] : null;
  const cols = options.length <= 2 ? 2 : options.length <= 6 ? 3 : 4;
  const [picker, setPicker] = useState(false);

  return (
    <Spread ctx={ctx} label={`Decision: ${stripHtml(title)}`}>
      <Page side="left">
        <header className={shared.head}>
          <div>
            <p className={[shared.headKicker, 't-label'].join(' ')}>Decision</p>
            <RichText as="h2" html={title} className={[shared.headTitle, 't-display'].join(' ')} slotKey="title" placeholder="What is being decided" />
          </div>
        </header>
        {d && !ctx.editable && (
          <p className={[styles.status, 't-label'].join(' ')} data-status={d.status}>
            <span>Status <b>{STATUS_LABEL[d.status]}</b></span>
            {d.date && <span>Date <b>{fmtDate(d.date)}</b></span>}
            <span>Cost <b>{d.cost != null ? money(d.cost) : '—'}</b></span>
          </p>
        )}
        {d && ctx.editable && (
          <p className={[styles.status, 't-label'].join(' ')} data-status={d.status} data-no-swipe>
            <label>
              Status{' '}
              <select className={controls.select} value={d.status} onChange={(e) => patchDecision(spreadId, { status: e.target.value as DecisionStatus })} data-testid="decision-status">
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
            </label>
            <label>
              Date <input className={controls.input} type="date" value={d.date ?? ''} onChange={(e) => patchDecision(spreadId, { date: e.target.value || null })} />
            </label>
            <label>
              Cost <input className={controls.number} type="number" inputMode="decimal" min={0} step="0.01" value={d.cost ?? ''} placeholder="—" onChange={(e) => patchDecision(spreadId, { cost: e.target.value === '' ? null : Number(e.target.value) })} />
            </label>
          </p>
        )}
        {chosen ? (
          <div className={styles.chosen}>
            <div className={styles.chosenImage}>
              <ItemImage item={chosen} size="full" sizes="(min-width: 820px) 40vw, 90vw" />
            </div>
            <p className={styles.chosenName}>
              <span>{chosen.name}</span>
              {chosen.price != null && <span className="t-label">{money(chosen.price, chosen.currency)}</span>}
              {ctx.editable && (
                <button type="button" className={controls.ghost} onClick={() => chooseOption(spreadId, null)}>Unchoose</button>
              )}
            </p>
          </div>
        ) : (
          <div className={styles.undecided}>
            <p>{options.length ? `${options.length} options on the table. Nothing chosen yet.` : 'Nothing on the table yet.'}</p>
            {ctx.editable && options.length > 0 && <span className="t-label" style={{ marginTop: 12 }}>Tap an option on the right to choose it</span>}
          </div>
        )}
        <RichText
          as="p"
          html={d?.why ?? ''}
          slotKey="decision.why"
          className={[styles.why, 't-body'].join(' ')}
          placeholder="Why this one"
          multiline
          onCommit={(html) => setDecisionWhy(spreadId, stripHtml(html))}
        />
      </Page>
      <Page side="right">
        <header className={shared.head}>
          <p className="t-label">Options considered</p>
          <p className={[shared.headMeta, 't-label'].join(' ')}>{options.length}</p>
        </header>
        <ul className={styles.options} style={{ '--cols': cols } as CSSProperties}>
          {options.map((o, i) => (
            <li key={o.id} className={styles.option} data-chosen={o.id === d?.chosenId ? 'true' : 'false'} data-option-id={o.id}>
              <div className={styles.optionImage}>
                <ItemImage item={o} size="tiny" />
                {ctx.editable && (
                  <span className={features.tileEdit}>
                    <button type="button" className={controls.iconButton} onClick={() => chooseOption(spreadId, o.id === d?.chosenId ? null : o.id)} aria-pressed={o.id === d?.chosenId} aria-label={o.id === d?.chosenId ? `Unchoose ${o.name}` : `Choose ${o.name}`} title="Choose" data-testid="choose-option">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L19 7" /></svg>
                    </button>
                    <button type="button" className={controls.iconButton} onClick={() => removeDecisionOption(spreadId, o.id)} aria-label={`Remove ${o.name} from the options`} title="Remove option">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                  </span>
                )}
              </div>
              <p className={styles.optionName}>
                <span className="t-label">{String(i + 1).padStart(2, '0')}</span>
                <span>{o.name}</span>
                {o.id === d?.chosenId && <span className={[styles.mark, 't-label'].join(' ')}>· Chosen</span>}
              </p>
            </li>
          ))}
          {ctx.editable && (
            <li className={styles.option}>
              <button type="button" className={features.addTile} onClick={() => setPicker(true)} style={{ aspectRatio: '1 / 1' }} data-testid="decision-add-option">
                <span className={controls.ghost}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                  Option
                </span>
              </button>
            </li>
          )}
        </ul>
      </Page>
      {picker && (
        <ItemPicker title="Add an option to consider" exclude={d?.optionIds ?? []} newPlaceholder={ctx.ref.chapter.title.toUpperCase()} onPick={(id) => addDecisionOption(spreadId, id)} onClose={() => setPicker(false)} />
      )}
    </Spread>
  );
}
