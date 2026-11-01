import { TEMPLATE_META } from '@/templates/meta';
import { Page, Spread } from '@/reader/Spread';
import type { SpreadCtx } from '@/reader/SpreadContext';

/** Phase-0 stand-in for templates that land in Phase 1. */
export function StubTemplate({ ctx }: { ctx: SpreadCtx }) {
  const meta = TEMPLATE_META[ctx.ref.spread.template];
  return (
    <Spread ctx={ctx}>
      <Page side="left">
        <p className="t-label" style={{ gridColumn: '1 / -1' }}>
          {meta.name}
        </p>
        <h2 className="t-display" style={{ gridColumn: '1 / -1', fontSize: 'var(--title)', marginTop: '1cqw' }}>
          {ctx.ref.chapter.title}
        </h2>
        <p className="t-caption" style={{ gridColumn: '1 / span 8', marginTop: '1cqw' }}>
          {meta.blurb}
        </p>
      </Page>
      <Page side="right">
        <div style={{ gridColumn: '1 / -1' }} />
      </Page>
    </Spread>
  );
}
