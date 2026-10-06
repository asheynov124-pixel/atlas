/**
 * OWNER: ui-core.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════
 *  COSMOPOLIS UI KIT — import everything from 'src/ui/core' (e.g. `import { Button, Sheet } from '../../ui/core'`)
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════
 * Design language "glass cockpit": translucent dark glass, hairline borders, cyan → violet accent gradient,
 * 18–22 px radii, system font with tabular numbers, springy transform/opacity animations (reduce-motion aware).
 * Tokens (CSS custom properties) are documented at the top of src/ui/styles.css — use them in your own CSS:
 *   var(--glass) var(--glass-strong) var(--hairline) var(--text) var(--text-2) var(--text-3) var(--accent)
 *   var(--accent-2) var(--accent-grad) var(--good) var(--warn) var(--bad) var(--money) var(--r-md) var(--r-xl)
 *   var(--ease-out) var(--ease-spring) var(--dur-2) var(--safe-top) var(--hud-top) var(--hud-bottom)
 *   Utility classes: .glass .glass-strong .num (tabular numbers) .muted .dim .grad-text .ellipsis .scroll-y .scroll-x
 *
 * SHELL CONTRACT (how your module's UI lives inside the App)
 *   • The shell root `.app` is pointer-events:none so the 3D canvas receives touches. Buttons, inputs and links are
 *     interactive automatically; give other interactive containers the class `pe` (or pointer-events:auto).
 *   • Panels (ui/registry registerPanel): the shell renders the chrome — title row with your `icon` + `title` and a
 *     close button — inside a Sheet ('sheet', default), Modal ('modal'), Drawer ('side') or full screen ('full',
 *     no chrome except a floating close button). Your component renders only the body. Keep body padding at 0 —
 *     the container already pads 16 px. Use <SectionHeader>, <Card>, <ListRow>, <Toggle>, <Slider>… inside.
 *   • Overlays (registerOverlay) are always mounted above the HUD; position them with --hud-top / --hud-bottom so
 *     they never collide with the top bar or the dock. Hide yourself when `ui.view` / `ui.photo` say so.
 *   • HUD buttons (registerHudButton): `icon` may be any icon name from ui/icons (preferred) or an emoji.
 *   • Esc / back: wrap closable UI in Sheet/Modal/Drawer (they register on the layer stack) or call useLayer().
 *   • Sounds: buttons click by default; call uiSound('open' | 'close' | 'toggle' | …) for custom interactions.
 *
 * COMPONENTS (all Preact function components, fully controlled)
 *   <Button variant="primary|secondary|glass|ghost|danger|success" size="sm|md|lg" icon iconRight block loading active onClick>
 *   <IconButton icon label size="sm|md|lg" variant="glass|ghost|primary|danger|solid" active badge showLabel kbd onClick>
 *   <Sheet open onClose title icon subtitle toolbar actions footer snaps={[0.5,0.94]} initialSnap backdrop maxWidth>
 *        adaptive: bottom sheet (drag handle, detents, swipe-to-dismiss) · side panel on landscape phones · floating card on wide screens
 *   <Modal open onClose title icon subtitle size="sm|md|lg|xl" footer dismissible centered>   (bottom card on phones)
 *   <Drawer open onClose side="right|left" title icon width footer actions backdrop>          (tall sheet on phones)
 *   <Tabs tabs={[{id,label,icon,badge}]} value onChange variant="pills|underline" iconOnly>
 *   <Segmented options={[{value,label,icon,title}]} value onChange size="sm|md" block>
 *   <Slider value min max step onChange onCommit label format icon ticks color>
 *   <Toggle checked onChange label description icon>
 *   <ColorSwatches colors={[0xff0000,…]} value onChange allowCustom allowNone size>
 *   <TextInput value onChange onSubmit label placeholder icon trailing maxLength>
 *   <Stepper value onChange min max step format>
 *   <Chip icon tone="neutral|accent|good|warn|bad|info|violet|money" selected onClick size="sm|md">
 *   <Badge tone dot>3</Badge>   <Kbd>B</Kbd>   <Stars value={3} />   <Spinner />   <Divider />
 *   <Card onClick selected disabled padded strong>
 *   <Stat icon label value delta deltaText positiveIsGood tone compact onClick>
 *   <ProgressBar value={0.4} tone label valueText height animated>
 *   <BarMeter value bipolar vertical color label length thickness>   (RCI-style meters)
 *   <SectionHeader title icon subtitle action>   <EmptyState icon title body action>
 *   <ListRow icon label description value chevron onClick danger trailing>
 *   <InspectRows rows={InspectRow[]} />   (renders sim inspect rows with bars & tones)
 *   <Icon name size /> · <IconOrEmoji value size /> · hasIcon(name) · ICON_NAMES   (from ui/icons)
 *
 * HELPERS
 *   uiSound(name) · unlockAudio() · openPanel(id) · closePanel() · setSelection(sel) · useLayer(active, close)
 *   useLongPress(onTap, onLong) · usePresence(open, ms) · viewport (signal) · useMedia(query) · reduceMotion()
 *   fmtMoney(n, compact?) · fmtCompact(n) · fmtInt(n) · fmtSigned(n) · fmtPercent(v) · timeAgo(ms) · fmtDuration(s)
 *   confirmDialog({title, body, okLabel, danger}) and notify({...}) live in ui/store.
 */
import './components.css';

export { Button, IconButton, type ButtonProps, type IconButtonProps, type ButtonVariant, type ButtonSize } from './Button';
export { Sheet, type SheetProps } from './Sheet';
export { Modal, Drawer, ConfirmHost, type ModalProps, type DrawerProps } from './Modal';
export {
  Tabs,
  Segmented,
  Slider,
  Toggle,
  ColorSwatches,
  TextInput,
  Stepper,
  type TabDef,
  type TabsProps,
  type SegmentOption,
  type SegmentedProps,
  type SliderProps,
  type ToggleProps,
  type ColorSwatchesProps,
  type TextInputProps,
} from './controls';
export {
  Chip,
  Badge,
  Card,
  Stat,
  ProgressBar,
  BarMeter,
  SectionHeader,
  EmptyState,
  Kbd,
  ListRow,
  Stars,
  Spinner,
  Divider,
  InspectRows,
  type Tone,
  type ChipProps,
  type CardProps,
  type StatProps,
  type ProgressBarProps,
  type BarMeterProps,
  type ListRowProps,
} from './display';
export { ToastStack } from './Toasts';
export { usePresence } from './presence';
export {
  uiSound,
  unlockAudio,
  openPanel,
  closePanel,
  setSelection,
  useLayer,
  pushLayer,
  closeTopLayer,
  useLongPress,
  viewport,
  useMedia,
  reduceMotion,
  nextPaint,
  call,
  type ViewportInfo,
} from './env';
export { fmtMoney, fmtCompact, fmtInt, fmtSigned, fmtPercent, timeAgo, fmtDuration, fmtGameDays, hexCss } from './format';
export { Icon, IconOrEmoji, hasIcon, ICON_NAMES } from '../icons';
export { confirmDialog, notify } from '../store';
