import type { DecisionStatus } from '../model/types';
import { Stamp } from '../templates/Decision';

// Phase 1 placeholders: choosing, status and facts editing arrive in Phase 3.
export const DecisionTools = {
  Status: ({ status }: { spreadId: string; status: DecisionStatus }) => <Stamp status={status} />,
  Choose: (_props: { spreadId: string; itemId: string; chosen: boolean }) => null,
  Field: ({ value }: { spreadId: string; field: string; value: string; placeholder: string; type?: string }) => <>{value || '—'}</>,
};
