import { BoardElement } from '../templates/MoodBoard';
import type { BoardEl } from '../model/types';

// Phase 1 placeholder: the editable canvas arrives in Phase 3.
export default function BoardEditor({ elements }: { spreadId: string; elements: BoardEl[] }) {
  return (
    <div className="board__canvas">
      {elements.map((el) => (
        <BoardElement key={el.id} el={el} />
      ))}
    </div>
  );
}
