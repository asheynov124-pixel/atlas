/**
 * OWNER: ui-core.
 * LoadingOverlay — animated orb logo + the current `ui.loading` message + rotating witty lines.
 * Matches the static #boot splash in index.html so boot → menu → game transitions feel seamless.
 */
import { useEffect, useState } from 'preact/hooks';
import { ui } from '../../store';
import { LOADING_LINES } from './names';

export function LoadingOverlay() {
  const msg = ui.loading.value;
  const [line, setLine] = useState(0);
  useEffect(() => {
    if (!msg) return;
    setLine(Math.floor(Math.random() * LOADING_LINES.length));
    const t = setInterval(() => setLine((l) => (l + 1) % LOADING_LINES.length), 1800);
    return () => clearInterval(t);
  }, [!!msg]);
  if (!msg) return null;
  return (
    <div class="ld-root" role="alert" aria-busy="true">
      <div class="ld-inner">
        <div class="ld-orb" aria-hidden="true">
          <div class="ld-orb-ring" />
          <div class="ld-orb-ring r2" />
          <div class="ld-orb-core" />
        </div>
        <div class="ld-word">COSMOPOLIS</div>
        <div class="ld-msg">{msg}</div>
        <div class="ld-tip" key={line}>
          {LOADING_LINES[line]}
        </div>
      </div>
    </div>
  );
}
