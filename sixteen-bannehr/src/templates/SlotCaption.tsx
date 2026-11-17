import { Caption, Editable } from './kit';
import { useSpread, useEditing } from '../reader/context';
import { updateSlot } from '../store/book';
import { isBlank } from '../model/sanitize';
import type { ImageSlot } from '../model/types';

/** The caption under (or beside) an image slot: "Fig. 3.4" and an editable line. */
export function SlotCaption({
  spreadId,
  slotKey,
  fig,
  className,
}: {
  spreadId: string;
  slotKey: string;
  fig?: string;
  className?: string;
}) {
  const { placed } = useSpread();
  const editing = useEditing();
  const slot = placed.spread.slots[slotKey] as ImageSlot | undefined;
  if (!slot) return null;
  const empty = isBlank(slot.caption);
  if (empty && !editing && !fig) return null;
  return (
    <Caption fig={fig} className={className}>
      <Editable
        as="span"
        single
        className="caption__text"
        html={slot.caption}
        onCommit={(h) =>
          updateSlot(spreadId, slotKey, 'image', (s) => {
            s.caption = h;
          })
        }
        placeholder="Add a caption"
      />
      {slot.credit ? <span className="caption__credit"> Photograph: {slot.credit}</span> : null}
    </Caption>
  );
}
