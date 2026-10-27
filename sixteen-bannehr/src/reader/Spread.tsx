import { memo, useMemo } from 'react';
import { SpreadProvider, type LayoutMode, type SpreadEnv } from './context';
import { templateComponent } from '../templates';
import type { Placed } from '../model/pages';

interface Props {
  placed: Placed;
  layout: LayoutMode;
  active?: boolean;
  decorative?: boolean;
  print?: boolean;
}

/** One spread: a template inside the frame that gives it pages, heads and folios. */
export const Spread = memo(function Spread({ placed, layout, active = false, decorative = false, print = false }: Props) {
  const env = useMemo<SpreadEnv>(() => ({ placed, layout, active, decorative, print }), [placed, layout, active, decorative, print]);
  const Template = templateComponent(placed.spread.template);
  return (
    <SpreadProvider value={env}>
      <article
        className={['spread', !placed.isCover && 'spread--open', `spread--${placed.spread.template}`].join(' ')}
        data-template={placed.spread.template}
        id={layout === 'phone' && !decorative && !print ? `spread-${placed.spread.id}` : undefined}
        data-spread={print ? undefined : placed.spread.id}
        aria-hidden={decorative || print || undefined}
        {...(decorative || print ? { inert: '' } : null)}
      >
        <Template />
      </article>
    </SpreadProvider>
  );
});
