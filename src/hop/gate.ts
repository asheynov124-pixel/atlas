/**
 * Open-path gate. Import this instead of reaching into PeekSheet from navigation.
 */
export type { HopKind, HopStatus, HopCopy } from './policy';
export {
  hopKind,
  hopStatus,
  hopCopy,
  isUnborn,
  canOpenDirectly,
  registerPeekHandler,
  requestPeek,
} from './policy';

export interface OpenOptions {
  /** Skip the peek confirm and open anyway (Stay was not chosen). */
  force?: boolean;
  /** Move the watermark to the record's spoil clock before opening. */
  advanceWatermark?: boolean;
}
