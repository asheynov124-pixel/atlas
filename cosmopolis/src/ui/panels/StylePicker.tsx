/**
 * OWNER: ui-panels.
 * StylePicker — the eight architectural styles (content/styles.ts) as tappable cards, each with a tiny procedural
 * skyline drawn in the style's own palette (walls, roofs, glass, night windows, accents; curvy styles get domes,
 * green styles roof gardens, neon styles glowing trims). Used by the districts and city panels.
 */
import type { StyleId } from '../../core/types';
import { STYLES, STYLE_IDS, type StylePalette } from '../../content/styles';
import { uiSound } from '../core/env';
import { Icon } from '../core';
import { css } from './common';

/** Mini skyline: three buildings in the style's palette. */
export function StyleArt({ style, size = 56 }: { style: StylePalette; size?: number }) {
  const w = style.walls, r = style.roofs, a = style.accents;
  const glass = css(style.glass);
  const lit = css(style.windowLight);
  const curvy = style.curvy > 0.5;
  const green = style.green > 0.4;
  const neon = style.neon > 0.4;
  const win = (x: number, y: number, cols: number, rows: number, key: string) => {
    const out = [];
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) out.push(<rect key={key + i + '-' + j} x={x + i * 4} y={y + j * 5} width="2.4" height="3" rx="0.5" fill={(i + j * 3) % 4 === 1 ? lit : glass} opacity={(i + j * 3) % 4 === 1 ? 0.95 : 0.75} />);
    return out;
  };
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" aria-hidden="true" class="up-style-art">
      <rect x="0" y="48" width="56" height="8" fill={green ? '#3f8a52' : '#2a3148'} />
      {/* left low block */}
      <rect x="4" y="30" width="15" height="18" rx={curvy ? 3 : 0.5} fill={css(w[1 % w.length])} />
      {curvy ? <ellipse cx="11.5" cy="30" rx="7.5" ry="4" fill={css(r[0])} /> : <polygon points="3,30 11.5,23 20,30" fill={css(r[0])} />}
      {win(6.5, 34, 3, 3, 'l')}
      {/* tall centre tower */}
      <rect x="20" y="10" width="16" height="38" rx={curvy ? 6 : 0.5} fill={css(w[0])} />
      {curvy ? <ellipse cx="28" cy="11" rx="8" ry="6" fill={glass} opacity="0.9" /> : <rect x="19" y="8" width="18" height="3" fill={css(r[r.length > 1 ? 1 : 0])} />}
      {win(22.5, 16, 3, 6, 'c')}
      {neon && <rect x="20" y="44" width="16" height="1.6" fill={css(a[0])} opacity="0.95" />}
      {neon && <rect x="35" y="12" width="1.2" height="32" fill={css(a[a.length > 1 ? 1 : 0])} opacity="0.9" />}
      {green && (
        <>
          <circle cx="23" cy="9" r="2.4" fill="#5fbf5a" />
          <circle cx="28" cy="7.6" r="2.8" fill="#4ca84c" />
          <circle cx="33" cy="9" r="2.2" fill="#6fd06a" />
        </>
      )}
      {/* right mid block */}
      <rect x="38" y="22" width="14" height="26" rx={curvy ? 4 : 0.5} fill={css(w[2 % w.length])} />
      <rect x="38" y="20" width="14" height="3" rx={curvy ? 1.5 : 0} fill={css(style.trims[0])} />
      {win(40.5, 26, 3, 4, 'r')}
      <rect x="38" y="42" width="14" height="2" fill={css(a[0])} opacity="0.85" />
    </svg>
  );
}

export interface StylePickerProps {
  value: StyleId | null | undefined;
  onChange: (s: StyleId) => void;
  /** show a "city default" option that maps to null */
  allowInherit?: boolean;
  onInherit?: () => void;
  compact?: boolean;
}

export function StylePicker(p: StylePickerProps) {
  return (
    <div class={'up-styles' + (p.compact ? ' is-compact' : '')} role="radiogroup" aria-label="Architectural style">
      {p.allowInherit && (
        <button
          type="button"
          role="radio"
          aria-checked={!p.value}
          class={'up-style' + (!p.value ? ' is-active' : '')}
          onClick={() => {
            uiSound('tap');
            p.onInherit?.();
          }}
        >
          <span class="up-style-inherit">
            <Icon name="link" size={22} />
          </span>
          <span class="up-style-name">City default</span>
        </button>
      )}
      {STYLE_IDS.map((id) => {
        const st = STYLES[id];
        const on = p.value === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            title={st.description}
            class={'up-style' + (on ? ' is-active' : '')}
            onClick={() => {
              uiSound('tap');
              p.onChange(id);
            }}
          >
            <StyleArt style={st} size={p.compact ? 46 : 56} />
            <span class="up-style-name">{st.name}</span>
            {on && (
              <span class="up-style-check">
                <Icon name="check" size={12} stroke={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
