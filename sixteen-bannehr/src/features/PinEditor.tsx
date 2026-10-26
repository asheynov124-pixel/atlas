import type { PointerEvent } from 'react';
import type { Pin } from '../model/types';

// Phase 1 placeholder: adding, moving and editing pins arrive in Phase 3.
export function PinEditor(_props: { spreadId: string; pin: Pin; onClose: () => void }) {
  return null;
}

PinEditor.ImageTools = function PlanImageTools(_props: { spreadId: string }) {
  return null;
};

export function usePinActions(_spreadId: string) {
  return {
    add: (_x: number, _y: number): string | null => null,
    startDrag: (_e: PointerEvent, _id: string) => {},
  };
}
