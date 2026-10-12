import { darken, mix, textOn } from '../lib/color';

/**
 * A small painted elevation of a room, built from a palette.
 * Used wherever a photo cannot load, so the page still reads as a room and not a broken image.
 */
export function RoomIllustration({ palette, kind = 'living', className = '' }: { palette: string[]; kind?: string; className?: string }) {
  const wall = palette[0] ?? '#f3efe6';
  const cloth = palette[1] ?? mix(wall, '#c9a673', 0.3);
  const wood = palette[2] ?? '#8a6a45';
  const dark = palette[3] ?? '#3a3632';
  const floor = mix(wood, '#c9a673', 0.45);
  const trim = mix(wall, '#ffffff', 0.5);
  const ink = textOn(wall);
  const id = `g${wall.slice(1)}${kind}`;
  return (
    <svg viewBox="0 0 300 400" className={`h-full w-full ${className}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id={`${id}-w`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={mix(wall, '#ffffff', 0.08)} /><stop offset="1" stopColor={darken(wall, 6)} /></linearGradient>
        <linearGradient id={`${id}-f`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={floor} /><stop offset="1" stopColor={darken(floor, 10)} /></linearGradient>
        <linearGradient id={`${id}-l`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#ffffff" stopOpacity="0.0" /><stop offset="0.5" stopColor="#ffffff" stopOpacity="0.18" /><stop offset="1" stopColor="#ffffff" stopOpacity="0" /></linearGradient>
      </defs>
      <rect width="300" height="400" fill={`url(#${id}-w)`} />
      {/* floor */}
      <rect y="290" width="300" height="110" fill={`url(#${id}-f)`} />
      {[0, 1, 2, 3, 4, 5].map((i) => <line key={i} x1={i * 60 - 20} y1="290" x2={i * 60 + 30} y2="400" stroke={darken(floor, 14)} strokeWidth="1" opacity="0.6" />)}
      {/* baseboard */}
      <rect y="282" width="300" height="9" fill={trim} />
      {/* window */}
      <rect x="180" y="70" width="86" height="130" fill={trim} />
      <rect x="187" y="77" width="72" height="116" fill={mix('#dbe6f2', wall, 0.35)} />
      <rect x="187" y="77" width="72" height="116" fill={`url(#${id}-l)`} />
      <line x1="223" y1="77" x2="223" y2="193" stroke={trim} strokeWidth="4" /><line x1="187" y1="135" x2="259" y2="135" stroke={trim} strokeWidth="4" />
      {/* light wash on the wall */}
      <polygon points="187,193 259,193 300,290 120,290" fill="#ffffff" opacity="0.07" />
      {/* art */}
      <rect x="44" y="92" width="92" height="70" fill={wood} />
      <rect x="50" y="98" width="80" height="58" fill={mix(wall, dark, 0.25)} />
      {kind === 'kitchen' ? (<>
        <rect x="20" y="200" width="260" height="90" fill={wood} />
        <rect x="16" y="196" width="268" height="8" fill={trim} />
        {[0, 1, 2, 3].map((i) => <rect key={i} x={30 + i * 64} y="214" width="52" height="30" fill={darken(wood, 6)} />)}
        {[0, 1, 2, 3].map((i) => <rect key={i} x={30 + i * 64} y="252" width="52" height="30" fill={darken(wood, 6)} />)}
        <circle cx="150" cy="60" r="16" fill={mix('#b08d57', dark, 0.2)} /><line x1="150" y1="0" x2="150" y2="44" stroke={dark} strokeWidth="2" />
      </>) : kind === 'bath' || kind === 'powder' ? (<>
        <ellipse cx="110" cy="275" rx="80" ry="26" fill="#f4f1ea" />
        <rect x="30" y="230" width="160" height="45" rx="20" fill="#f4f1ea" />
        <ellipse cx="110" cy="232" rx="68" ry="14" fill={mix('#dbe6f2', '#f4f1ea', 0.4)} />
        <circle cx="236" cy="150" r="26" fill="none" stroke={mix('#b08d57', dark, 0.2)} strokeWidth="4" />
      </>) : kind === 'bedroom' || kind === 'guest' || kind === 'nursery' ? (<>
        <rect x="40" y="180" width="200" height="60" rx="6" fill={cloth} />
        <rect x="46" y="236" width="188" height="44" fill="#f4f1ea" />
        <rect x="46" y="280" width="188" height="18" fill={cloth} />
        <rect x="60" y="246" width="60" height="22" rx="4" fill="#fbf8f2" /><rect x="160" y="246" width="60" height="22" rx="4" fill="#fbf8f2" />
      </>) : kind === 'dining' ? (<>
        <rect x="50" y="240" width="200" height="12" fill={dark} /><rect x="70" y="252" width="8" height="40" fill={dark} /><rect x="222" y="252" width="8" height="40" fill={dark} />
        {[0, 1, 2].map((i) => <rect key={i} x={75 + i * 60} y="212" width="30" height="30" fill={wood} />)}
        <circle cx="150" cy="150" r="20" fill={mix('#b08d57', dark, 0.2)} /><line x1="150" y1="0" x2="150" y2="130" stroke={dark} strokeWidth="2" />
      </>) : kind === 'entry' || kind === 'hall' || kind === 'mudroom' ? (<>
        <rect x="70" y="250" width="160" height="12" fill={wood} /><rect x="80" y="262" width="6" height="28" fill={wood} /><rect x="214" y="262" width="6" height="28" fill={wood} />
        <ellipse cx="150" cy="248" rx="22" ry="6" fill={dark} />
        <rect x="236" y="80" width="30" height="190" fill={trim} />
      </>) : kind === 'office' ? (<>
        <rect x="60" y="235" width="180" height="10" fill={wood} /><rect x="70" y="245" width="6" height="45" fill={wood} /><rect x="224" y="245" width="6" height="45" fill={wood} />
        <rect x="120" y="205" width="60" height="30" fill={dark} />
        <rect x="90" y="250" width="36" height="40" rx="6" fill={cloth} />
      </>) : kind === 'deck' ? (<>
        <rect x="30" y="228" width="240" height="40" rx="6" fill={cloth} /><rect x="30" y="268" width="240" height="22" fill={wood} />
        <path d="M 250 290 L 262 230 L 274 290 Z" fill="#b8714f" />
      </>) : (<>
        {/* living / lounge: a sofa, a lamp, a plant */}
        <rect x="40" y="215" width="190" height="55" rx="8" fill={cloth} />
        <rect x="40" y="250" width="190" height="40" rx="4" fill={darken(cloth, 5)} />
        <rect x="46" y="222" width="80" height="26" rx="4" fill={mix(cloth, '#ffffff', 0.15)} /><rect x="144" y="222" width="80" height="26" rx="4" fill={mix(cloth, '#ffffff', 0.15)} />
        <rect x="248" y="150" width="3" height="140" fill={mix('#b08d57', dark, 0.3)} />
        <path d="M 232 150 L 268 150 L 262 120 L 238 120 Z" fill="#f1e9d8" />
        <circle cx="20" cy="210" r="22" fill="#5c6854" /><circle cx="30" cy="190" r="16" fill="#5c6854" /><rect x="10" y="230" width="24" height="40" fill="#b8714f" />
      </>)}
      <text x="12" y="388" fontSize="10" fill={ink} opacity="0.35" fontFamily="Outfit, sans-serif" letterSpacing="2">ALDER</text>
    </svg>
  );
}
