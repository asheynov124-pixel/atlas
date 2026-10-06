/**
 * OWNER: ui-core.
 * PanelHost — renders the open registry panel (`ui.panel`) in the container its `kind` asks for:
 * 'sheet' (default) → Sheet, 'modal' → Modal, 'side' → Drawer, 'full' → full-screen layer with a floating close.
 * The shell draws the chrome (icon, title, close); panel components render their body only.
 * Panels are wrapped in an error boundary so a failing panel never takes the HUD down.
 */
import { Component, type ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';
import { Icon } from '../../icons';
import { panels, type PanelDef } from '../../registry';
import { ui } from '../../store';
import { EmptyState } from '../display';
import { useLayer, uiSound, viewport } from '../env';
import { Drawer, Modal } from '../Modal';
import { usePresence } from '../presence';
import { Sheet } from '../Sheet';

class Boundary extends Component<{ id: string; children: ComponentChildren }, { err: Error | null }> {
  override state = { err: null as Error | null };
  static override getDerivedStateFromError(err: Error) {
    return { err };
  }
  override componentDidCatch(err: Error) {
    console.error(`[ui] panel "${this.props.id}" crashed`, err);
  }
  override render() {
    if (this.state.err) return <EmptyState icon="alert" title="This panel hit turbulence" body="Close it and try again in a moment." />;
    return this.props.children;
  }
}

function FullPanel({ def, open, onClose }: { def: PanelDef; open: boolean; onClose: () => void }) {
  const { mounted, shown } = usePresence(open, 300);
  useLayer(open, onClose);
  if (!mounted) return null;
  const C = def.component;
  return (
    <div class={'ph-full pe' + (shown ? ' is-shown' : '')} role="dialog" aria-label={def.title}>
      <Boundary id={def.id}>
        <C onClose={onClose} />
      </Boundary>
      <button type="button" class="ph-full-close" aria-label={`Close ${def.title}`} onClick={onClose}>
        <Icon name="close" size={20} />
      </button>
    </div>
  );
}

export function PanelHost() {
  const id = ui.panel.value;
  const live = id ? panels.get(id) ?? null : null;
  // keep the last panel rendered while its exit animation plays
  const last = useRef<PanelDef | null>(live);
  if (live) last.current = live;
  const def = last.current;
  const open = !!live;
  const close = () => {
    if (ui.panel.value) ui.panel.value = null;
  };
  void viewport.value;
  if (!def) return null;
  const C = def.component;
  const body = (
    <Boundary id={def.id} key={def.id}>
      <C onClose={close} />
    </Boundary>
  );
  const kind = def.kind ?? 'sheet';
  if (kind === 'full') return <FullPanel def={def} open={open} onClose={() => (uiSound('close'), close())} />;
  if (kind === 'modal')
    return (
      <Modal open={open} onClose={close} title={def.title} icon={def.icon} size="md" class={'ph-panel ph-' + def.id}>
        {body}
      </Modal>
    );
  if (kind === 'side')
    return (
      <Drawer open={open} onClose={close} title={def.title} icon={def.icon} width={420} class={'ph-panel ph-' + def.id}>
        {body}
      </Drawer>
    );
  return (
    <Sheet open={open} onClose={close} title={def.title} icon={def.icon} snaps={[0.64, 0.94]} maxWidth={720} class={'ph-panel ph-' + def.id}>
      {body}
    </Sheet>
  );
}
