/**
 * The Night Glass design lint. It reads the rules from the design itself (the colors
 * in src/styles/tokens.css) and checks what the browser actually renders, so it works
 * on screens nobody has seen yet, which a reference image can't.
 */
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

type RGB = [number, number, number];

export interface Rules {
  /** Every color in tokens.css, at any alpha. */
  palette: RGB[];
  /** Verb colors (like, pass, save) that may only color text inside [data-verb] or [data-tone]. */
  verbColors: RGB[];
  /** The two ends of the primary gradient. */
  gradient: [RGB, RGB];
  radii: string[];
  weights: string[];
  minTarget: number;
}

const hexToRgb = (hex: string): RGB => {
  const h = hex.length === 4 ? hex.slice(1).replace(/./g, (c) => c + c) : hex.slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

export function loadRules(): Rules {
  const css = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');
  const palette: RGB[] = [
    [0, 0, 0],
    [255, 255, 255],
  ];
  for (const m of css.matchAll(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi)) palette.push(hexToRgb(m[0]));
  for (const m of css.matchAll(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/gi)) palette.push([+m[1], +m[2], +m[3]]);
  const token = (name: string): RGB => {
    const m = new RegExp(`--${name}:\\s*(#[0-9a-f]{3,6})`, 'i').exec(css);
    if (!m) throw new Error(`tokens.css has no --${name}`);
    return hexToRgb(m[1]);
  };
  return {
    palette,
    verbColors: [token('like'), token('dislike'), token('save')],
    gradient: [token('accent'), token('accent-2')],
    radii: ['0px', '3px', '6px', '9px', '10px', '12px', '14px', '18px', '22px', '999px', '50%'],
    weights: ['400', '560', '600', '650', '700', '800'],
    minTarget: 32,
  };
}

/** Runs in the page. Self-contained: Playwright serialises it. */
function inspect(rules: Rules): string[] {
  const problems = new Set<string>();
  const near = (a: RGB, b: RGB) => Math.abs(a[0] - b[0]) <= 2 && Math.abs(a[1] - b[1]) <= 2 && Math.abs(a[2] - b[2]) <= 2;
  const colorsIn = (value: string) =>
    [...value.matchAll(/rgba?\(([^)]+)\)/g)].map((m) => {
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return { rgb: [p[0], p[1], p[2]] as RGB, alpha: p.length > 3 ? p[3] : 1 };
    });
  const name = (el: Element) => {
    const cls = el.getAttribute('class')?.trim().split(/\s+/).slice(0, 2).join('.');
    const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 28);
    return `<${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}>${text ? ` “${text}”` : ''}`;
  };
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) return false;
    return el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  };
  const ownText = (el: Element) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim());
  const skip = new Set(['STYLE', 'SCRIPT', 'DEFS', 'STOP', 'LINEARGRADIENT', 'RADIALGRADIENT', 'TITLE']);

  // With a modal open, only what's on top counts: the modal itself and the toasts.
  const modals = [...document.querySelectorAll('[aria-modal="true"]')].filter(visible);
  const top = modals.at(-1);
  const inScope = (el: Element) => !top || top.contains(el) || !!el.closest('.toasts');

  let gradients = 0;
  for (const el of document.querySelectorAll('body *')) {
    if (skip.has(el.tagName.toUpperCase()) || el.closest('[data-media]') || !inScope(el) || !visible(el)) continue;
    const cs = getComputedStyle(el);
    const isSvg = el instanceof SVGElement;

    // 1. Colors: only Night Glass tokens (any alpha).
    const props: [string, string][] = [
      ['color', cs.color],
      ['background', cs.backgroundColor],
      ['gradient', cs.backgroundImage],
      ['shadow', cs.boxShadow],
      ['text-shadow', cs.textShadow],
    ];
    for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const)
      if (parseFloat(cs.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0 && cs.getPropertyValue(`border-${side.toLowerCase()}-style`) !== 'none')
        props.push(['border', cs.getPropertyValue(`border-${side.toLowerCase()}-color`)]);
    if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) props.push(['outline', cs.outlineColor]);
    if (isSvg) props.push(['fill', cs.fill], ['stroke', cs.stroke]);
    for (const [prop, value] of props)
      for (const c of colorsIn(value)) if (c.alpha > 0 && !rules.palette.some((p) => near(p, c.rgb))) problems.add(`${name(el)}: ${prop} ${value.slice(0, 60)} isn’t a Night Glass token`);

    // 2. Verb colors mean their verb: only on verb elements (or explicit danger).
    if ((ownText(el) || isSvg) && rules.verbColors.some((v) => colorsIn(cs.color).some((c) => near(v, c.rgb))) && !el.closest('[data-verb], [data-tone]'))
      problems.add(`${name(el)}: uses a verb color without data-verb (or data-tone="danger")`);

    // 3. Shape and type come from the scale.
    if (!isSvg)
      for (const corner of ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'] as const) {
        const r = cs.getPropertyValue(`border-${corner.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).slice(1)}-radius`).split(' ')[0];
        if (r && !rules.radii.includes(r)) problems.add(`${name(el)}: corner radius ${r} isn’t on the scale (${rules.radii.join(', ')})`);
      }
    if (ownText(el) && !rules.weights.includes(cs.fontWeight)) problems.add(`${name(el)}: font weight ${cs.fontWeight} isn’t one of ${rules.weights.join(', ')}`);

    // 4. Controls: big enough to hit, and named.
    if (el.matches('button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="switch"]')) {
      const r = el.getBoundingClientRect();
      const labelled = el instanceof HTMLInputElement && (el.labels?.length ?? 0) > 0;
      if (!labelled && (r.width < rules.minTarget || r.height < rules.minTarget)) problems.add(`${name(el)}: ${Math.round(r.width)}×${Math.round(r.height)}px is smaller than ${rules.minTarget}px`);
      const named = (el.textContent ?? '').trim() || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title') || labelled || el.getAttribute('placeholder');
      if (!named) problems.add(`${name(el)}: has no accessible name (add text or aria-label)`);
      if (cs.backgroundImage.includes('gradient') && rules.gradient.every((g) => colorsIn(cs.backgroundImage).some((c) => near(g, c.rgb)))) gradients++;
    }
  }

  // 5. One gradient per view: it means "the thing to press".
  if (gradients > 1) problems.add(`${gradients} gradient buttons on screen; Night Glass allows one per view`);

  // 6. Nothing scrolls sideways.
  for (const el of [document.documentElement, ...document.querySelectorAll('.view, .page, .sheet__body')])
    if (visible(el) && el.scrollWidth > el.clientWidth + 1) problems.add(`${name(el)}: content is ${el.scrollWidth - el.clientWidth}px wider than the screen`);

  return [...problems];
}

export const lint = (page: Page, rules: Rules) => page.evaluate(inspect, rules);
