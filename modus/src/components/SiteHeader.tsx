import Link from 'next/link';

const NAV = [
  { href: '/', label: 'Index', key: 'index' },
  { href: '/atlas', label: 'Atlas', key: 'atlas' },
  { href: '/unidentified', label: 'Unidentified', key: 'unidentified' },
  { href: '/records', label: 'Court records', key: 'records' },
];

export function SiteHeader({ active, search = true }: { active?: string; search?: boolean }) {
  return (
    <header className="hdr">
      <div className="wrap" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '14px 36px', paddingTop: 14, paddingBottom: 14 }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span className="wordmark">MODUS</span>
          <span className="mono" style={{ fontSize: 11, color: '#A9AEB5', letterSpacing: '.08em' }}>Serial murder in America, graded by evidence</span>
        </Link>
        <nav aria-label="Primary" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 26px', fontSize: 14, fontWeight: 500, letterSpacing: '.04em' }}>
          {NAV.map((n) => <Link key={n.key} href={n.href} className={active === n.key ? 'on' : undefined}>{n.label}</Link>)}
        </nav>
        {search && (
          <form action="/search" style={{ flex: '1 1 260px', display: 'flex', justifyContent: 'flex-end' }}>
            <label htmlFor="q" className="sr-only">Search</label>
            <input id="q" name="q" type="search" className="srch" placeholder="Name, method, county, case no." />
          </form>
        )}
      </div>
    </header>
  );
}
