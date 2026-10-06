/**
 * OWNER: ui-core.
 * Modal (centred card; a bottom card on phones), Drawer (side panel; a tall bottom sheet on phones) and the
 * ConfirmHost that renders `ui.confirm` requests (use `confirmDialog()` from ui/store to ask).
 */
import type { ComponentChildren, Ref } from 'preact';
import { Icon, IconOrEmoji } from '../icons';
import { ui } from '../store';
import { Button } from './Button';
import { useDialogFocus, useLayer, uiSound } from './env';
import { usePresence } from './presence';
import { useEffect, useRef } from 'preact/hooks';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ComponentChildren;
  icon?: string;
  subtitle?: ComponentChildren;
  /** 'sm' 380 · 'md' 520 · 'lg' 760 · 'xl' 980 px max width */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: ComponentChildren;
  /** tap outside / Esc closes (default true) */
  dismissible?: boolean;
  noClose?: boolean;
  class?: string;
  /** centre the header (dialogs, celebrations) */
  centered?: boolean;
  children?: ComponentChildren;
  sound?: boolean;
}

export function Modal(p: ModalProps) {
  const { mounted, shown } = usePresence(p.open, 280);
  const dismissible = p.dismissible ?? true;
  const ref = useRef<HTMLElement>(null);
  useLayer(p.open, () => dismissible && p.onClose());
  useDialogFocus(p.open && mounted, ref);
  useEffect(() => {
    if (p.sound === false) return;
    if (p.open) uiSound('open');
  }, [p.open]);
  if (!mounted) return null;
  return (
    <div class={'cz-modal-root' + (shown ? ' is-shown' : '') + (p.centered ? ' is-centered' : '')}>
      <div class="cz-backdrop pe" onClick={() => dismissible && p.onClose()} aria-hidden="true" />
      <section ref={ref as Ref<HTMLElement>} class={`cz-modal cz-modal-${p.size ?? 'md'} glass-strong pe ${p.class ?? ''}`} role="dialog" aria-modal="true" aria-label={typeof p.title === 'string' ? p.title : undefined}>
        {(p.title || p.icon || !p.noClose) && (
          <header class="cz-modal-head">
            {p.icon && (
              <span class="cz-sheet-icon">
                <IconOrEmoji value={p.icon} size={20} />
              </span>
            )}
            <div class="grow cz-sheet-titles">
              {p.title && <h2 class="cz-sheet-title">{p.title}</h2>}
              {p.subtitle && <div class="cz-sheet-subtitle">{p.subtitle}</div>}
            </div>
            {!p.noClose && (
              <button type="button" class="cz-close" aria-label="Close" onClick={p.onClose}>
                <Icon name="close" size={18} />
              </button>
            )}
          </header>
        )}
        <div class="cz-modal-body scroll-y">{p.children}</div>
        {p.footer && <footer class="cz-modal-foot">{p.footer}</footer>}
      </section>
    </div>
  );
}

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  side?: 'left' | 'right';
  title?: ComponentChildren;
  icon?: string;
  subtitle?: ComponentChildren;
  /** px (default 400) */
  width?: number;
  footer?: ComponentChildren;
  actions?: ComponentChildren;
  /** dim the scene (default false — drawers sit beside the action) */
  backdrop?: boolean;
  class?: string;
  children?: ComponentChildren;
}

export function Drawer(p: DrawerProps) {
  const { mounted, shown } = usePresence(p.open, 320);
  useLayer(p.open, p.onClose);
  useEffect(() => {
    if (p.open) uiSound('open');
  }, [p.open]);
  if (!mounted) return null;
  const side = p.side ?? 'right';
  return (
    <div class={`cz-drawer-root side-${side}` + (shown ? ' is-shown' : '') + (p.backdrop ? ' with-backdrop' : '')}>
      <div class="cz-backdrop pe" onClick={p.onClose} aria-hidden="true" />
      <section class={`cz-drawer glass-strong pe ${p.class ?? ''}`} style={{ width: (p.width ?? 400) + 'px' }} role="dialog" aria-label={typeof p.title === 'string' ? p.title : undefined}>
        <header class="cz-modal-head">
          {p.icon && (
            <span class="cz-sheet-icon">
              <IconOrEmoji value={p.icon} size={20} />
            </span>
          )}
          <div class="grow cz-sheet-titles">
            {p.title && <h2 class="cz-sheet-title ellipsis">{p.title}</h2>}
            {p.subtitle && <div class="cz-sheet-subtitle ellipsis">{p.subtitle}</div>}
          </div>
          {p.actions}
          <button type="button" class="cz-close" aria-label="Close" onClick={p.onClose}>
            <Icon name="close" size={18} />
          </button>
        </header>
        <div class="cz-modal-body scroll-y">{p.children}</div>
        {p.footer && <footer class="cz-modal-foot">{p.footer}</footer>}
      </section>
    </div>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title?: ComponentChildren;
  body?: ComponentChildren;
  okLabel?: string;
  cancelLabel?: string;
  /** destructive action: red button + warning icon */
  danger?: boolean;
  icon?: string;
  /** true = confirmed, false = cancelled / dismissed */
  onResult: (ok: boolean) => void;
}

/**
 * A controlled yes/no dialog. For one-off questions prefer the promise API:
 *   `if (await confirmDialog({ title: 'Demolish?', danger: true })) …`   (ui/store, rendered by ConfirmHost)
 */
export function ConfirmDialog(p: ConfirmDialogProps) {
  const close = (ok: boolean) => {
    uiSound(ok ? (p.danger ? 'bulldoze' : 'click') : 'close');
    p.onResult(ok);
  };
  return (
    <Modal
      open={p.open}
      onClose={() => close(false)}
      size="sm"
      centered
      noClose
      sound={false}
      icon={p.icon ?? (p.danger ? 'alert' : 'help')}
      title={p.title}
      class={p.danger ? 'is-danger' : ''}
      footer={
        <div class="cz-confirm-actions">
          <Button variant="glass" block onClick={() => close(false)} sound={false}>
            {p.cancelLabel ?? 'Cancel'}
          </Button>
          <Button variant={p.danger ? 'danger' : 'primary'} block onClick={() => close(true)} sound={false}>
            {p.okLabel ?? 'OK'}
          </Button>
        </div>
      }
    >
      {p.body && <p class="cz-confirm-body">{p.body}</p>}
    </Modal>
  );
}

/** Renders `ui.confirm` (mounted once by the App shell). */
export function ConfirmHost() {
  const live = ui.confirm.value;
  // keep showing the last request while the exit animation plays
  const last = useRef(live);
  if (live) last.current = live;
  const req = last.current;
  return (
    <ConfirmDialog
      open={!!live}
      title={req?.title}
      body={req?.body}
      okLabel={req?.okLabel}
      cancelLabel={req?.cancelLabel}
      danger={req?.danger}
      onResult={(ok) => live?.resolve(ok)}
    />
  );
}
