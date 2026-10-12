import { lazy, Suspense, useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Compass, BookOpen, Lightbulb, LayoutGrid, Home, Bookmark, Sparkles, Sun, Moon, Wallet, ShoppingBag, Users, TreePine, Menu, type LucideIcon } from 'lucide-react';
import { useStore } from './lib/store';
import { Sheet } from './components/ui';

const Studies = lazy(() => import('./routes/Studies'));
const Catalog = lazy(() => import('./routes/Catalog'));
const Ideas = lazy(() => import('./routes/Ideas'));
const Learn = lazy(() => import('./routes/Learn'));
const LessonPage = lazy(() => import('./routes/Lesson'));
const Studio = lazy(() => import('./routes/Studio'));
const Boards = lazy(() => import('./routes/Boards'));
const House = lazy(() => import('./routes/House'));
const Room = lazy(() => import('./routes/Room'));
const Budget = lazy(() => import('./routes/Budget'));
const Orders = lazy(() => import('./routes/Orders'));
const Decisions = lazy(() => import('./routes/Decisions'));
const LotPage = lazy(() => import('./routes/Lot'));

interface Item { to: string; label: string; icon: LucideIcon; end?: boolean; hint: string }
const GROUPS: { label: string; items: Item[] }[] = [
  { label: 'Your house', items: [
    { to: '/', label: 'Overview', icon: Home, end: true, hint: 'Every room, what it costs, what needs you' },
    { to: '/lot', label: 'Outside', icon: TreePine, hint: 'The lot, setbacks, deck and pool' },
    { to: '/decisions', label: 'Decisions', icon: Users, hint: 'Open choices, votes, who calls it' },
    { to: '/budget', label: 'Budget', icon: Wallet, hint: 'The whole number, by room and category' },
    { to: '/orders', label: 'Orders', icon: ShoppingBag, hint: 'What to order first, what is in' },
  ] },
  { label: 'Explore', items: [
    { to: '/studio', label: 'Studio', icon: Sparkles, hint: 'Try colors, finishes and light in 3D' },
    { to: '/studies', label: 'Studies', icon: Compass, hint: 'Ten finished rooms, taken apart' },
    { to: '/catalog', label: 'Catalog', icon: LayoutGrid, hint: 'Pieces with prices and lead times' },
    { to: '/ideas', label: 'Ideas', icon: Lightbulb, hint: 'Compose a room from a mood' },
    { to: '/boards', label: 'Boards', icon: Bookmark, hint: 'Everything you saved' },
  ] },
  { label: 'Learn', items: [
    { to: '/learn', label: 'Lessons', icon: BookOpen, hint: 'Sixteen short lessons with quizzes' },
  ] },
];
const ALL = GROUPS.flatMap((g) => g.items);
const MOBILE = ['/', '/studio', '/catalog', '/budget'];

function NavItem({ n, onPick }: { n: Item; onPick?: () => void }) {
  return (
    <NavLink to={n.to} end={n.end} onClick={onPick} title={n.hint} className={({ isActive }) => `flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors ${isActive ? 'bg-surface font-medium text-fg shadow-sm ring-1 ring-line' : 'text-muted hover:bg-surface/70 hover:text-fg'}`}>
      <n.icon className="size-4 shrink-0" />{n.label}
    </NavLink>
  );
}

export default function App() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const houseName = useStore((s) => s.house.settings.name);
  const loc = useLocation();
  const [more, setMore] = useState(false);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { window.scrollTo({ top: 0 }); setMore(false); }, [loc.pathname]);
  const full = loc.pathname === '/studio' || loc.pathname === '/lot' || /^\/house\/[^/]+$/.test(loc.pathname);
  const ThemeIcon = theme === 'dark' ? Sun : Moon;

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-bg px-3 py-5 md:flex">
        <NavLink to="/" className="flex items-baseline gap-2 px-3">
          <span className="display text-2xl">Alder</span>
          <span className="text-xs text-muted">design studio</span>
        </NavLink>
        <p className="mt-1 truncate px-3 text-xs text-muted" title={houseName}>{houseName}</p>
        <nav className="mt-6 flex flex-col gap-5">
          {GROUPS.map((g) => (
            <div key={g.label}>
              <p className="kicker mb-1.5 px-3">{g.label}</p>
              <div className="flex flex-col gap-0.5">{g.items.map((n) => <NavItem key={n.to} n={n} />)}</div>
            </div>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-1 border-t border-line pt-3">
          <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm text-muted hover:bg-surface/70 hover:text-fg">
            <ThemeIcon className="size-4" />{theme === 'dark' ? 'Paper theme' : 'Night theme'}
          </button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line bg-bg px-4 py-2 md:hidden">
          <NavLink to="/" className="flex min-h-11 items-baseline gap-2"><span className="display text-xl">Alder</span><span className="text-xs text-muted">design studio</span></NavLink>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="grid size-11 place-items-center rounded-lg text-muted hover:bg-surface"><ThemeIcon className="size-5" /></button>
            <button type="button" aria-label="All pages" onClick={() => setMore(true)} className="grid size-11 place-items-center rounded-lg text-fg hover:bg-surface"><Menu className="size-5" /></button>
          </div>
        </header>

        <main className={`min-h-0 min-w-0 flex-1 ${full ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          <Suspense fallback={<p className="p-6 text-sm text-muted">Opening…</p>}>
            <Routes>
              <Route path="/" element={<House />} />
              <Route path="/house" element={<House />} />
              <Route path="/studies" element={<Studies />} />
              <Route path="/catalog" element={<Catalog />} />
              <Route path="/ideas" element={<Ideas />} />
              <Route path="/learn" element={<Learn />} />
              <Route path="/learn/:lessonId" element={<LessonPage />} />
              <Route path="/studio" element={<Studio />} />
              <Route path="/boards" element={<Boards />} />
              <Route path="/house/:roomId" element={<Room />} />
              <Route path="/budget" element={<Budget />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/decisions" element={<Decisions />} />
              <Route path="/lot" element={<LotPage />} />
              <Route path="*" element={<House />} />
            </Routes>
          </Suspense>
        </main>

        <nav className="pb-safe no-print flex shrink-0 border-t border-line bg-bg md:hidden">
          {ALL.filter((n) => MOBILE.includes(n.to)).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] ${isActive ? 'font-medium text-fg' : 'text-muted'}`}>
              <n.icon className="size-5" />{n.label}
            </NavLink>
          ))}
          <button type="button" onClick={() => setMore(true)} className="flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] text-muted"><Menu className="size-5" />More</button>
        </nav>
      </div>

      <Sheet open={more} onClose={() => setMore(false)} title="Everything in Alder">
        <div className="flex flex-col gap-5 px-4 pt-4">
          {GROUPS.map((g) => (
            <div key={g.label}>
              <p className="kicker mb-2">{g.label}</p>
              <div className="flex flex-col gap-1">
                {g.items.map((n) => (
                  <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setMore(false)} className={({ isActive }) => `flex min-h-12 items-center gap-3 rounded-xl border px-3 ${isActive ? 'border-fg bg-surface' : 'border-line bg-surface'}`}>
                    <n.icon className="size-5 shrink-0 text-muted" />
                    <span className="min-w-0"><span className="block text-sm font-medium">{n.label}</span><span className="block truncate text-xs text-muted">{n.hint}</span></span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
