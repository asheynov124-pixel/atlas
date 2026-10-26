import { Sheet } from './Panels';

// Phase 2 placeholder: export and import arrive in Phase 4.
export default function SharePanel({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="Share the book" kicker="Export and import" onClose={onClose}>
      <p className="sheet-note">Export and import are being bound in.</p>
    </Sheet>
  );
}
