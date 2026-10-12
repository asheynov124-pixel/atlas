import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { ALL_MARKETS, MARKET_NAMES, marketUrl, type Market } from '../data/markets';

export function ShopLinks({ query, markets, compact }: { query: string; markets: Market[]; compact?: boolean }) {
  const [all, setAll] = useState(false);
  const list = all ? ALL_MARKETS : markets;
  return (
    <div className="flex flex-col gap-2">
      {!compact && <p className="text-sm text-muted">Searches, not single listings, so you can compare what is actually for sale.</p>}
      <div className={compact ? 'flex flex-wrap gap-2' : 'flex flex-col gap-2'}>
        {list.map((m) => (
          <a key={m} href={marketUrl(m, query)} target="_blank" rel="noreferrer noopener" className={compact ? 'inline-flex min-h-11 items-center gap-1 rounded-full bg-raised px-3 text-xs' : 'flex min-h-11 items-center justify-between rounded-2xl bg-raised px-4 text-sm'}>
            <span>{MARKET_NAMES[m]}</span>
            <span className="inline-flex items-center gap-1 text-oak">{!compact && 'Search '}<ArrowUpRight className="size-4" /></span>
          </a>
        ))}
      </div>
      {!all && <button type="button" className="min-h-11 text-left text-sm text-oak" onClick={() => setAll(true)}>More marketplaces</button>}
    </div>
  );
}
