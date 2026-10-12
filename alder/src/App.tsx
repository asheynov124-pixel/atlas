import { lazy, Suspense, useEffect } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Compass, BookOpen, Lightbulb, LayoutGrid, Home, Bookmark, Sparkles, Sun, Moon, Wallet, ShoppingBag, Users, TreePine } from 'lucide-react';
import { useStore } from './lib/store';

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

const NAV = [
  { to: '/', label: 'Studies', icon: Compass, end: true },
  { to: '/catalog', label: 'Catalog', icon: LayoutGrid },
  { to: '/ideas', label: 'Ideas', icon: Lightbulb },
  { to: '/learn', label: 'Learn', icon: BookOpen },
  { to: '/studio', label: 'Studio', icon: Sparkles },
  { to: '/house', label: 'My House', icon: Home },
  { to: '/lot', label: 'Outside', icon: TreePine },
  { to: '/decisions', label: 'Decisions', icon: Users },
  { to: '/budget', label: 'Budget', icon: Wallet },
  { to: '/orders', label: 'Orders', icon: ShoppingBag },
];
const MOBILE = ['/', '/studio', '/house', '/decisions', '/budget'];

export default function App() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const loc = useLocation();
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [loc.pathname]);
  const full = loc.pathname === '/studio' || loc.pathname === '/lot' || /^\/house\/[^/]+$/.test(loc.pathname);

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-line px-3 py-6 md:flex">
        <NavLink to="/" className="px-3 display text-3xl italic text-fg">Alder</NavLink>
        <p className="mt-1 px-3 text-xs text-muted">An atelier for the house you are building.</p>
        <nav className="mt-8 flex flex-col gap-1">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm ${isActive ? 'bg-raised text-oak' : 'text-muted hover:text-fg'}`}>
              <n.icon className="size-4" />{n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-1">
          <NavLink to="/boards" className={({ isActive }) => `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm ${isActive ? 'bg-raised text-oak' : 'text-muted hover:text-fg'}`}><Bookmark className="size-4" />Boards</NavLink>
          <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-muted hover:text-fg">
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}{theme === 'dark' ? 'Paper theme' : 'Night theme'}
          </button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line px-4 py-2 md:hidden">
          <NavLink to="/" className="flex min-h-11 items-center display text-2xl italic">Alder</NavLink>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="grid size-11 place-items-center text-muted">{theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}</button>
            <NavLink to="/catalog" aria-label="Catalog" className="grid size-11 place-items-center text-muted"><LayoutGrid className="size-5" /></NavLink>
            <NavLink to="/learn" aria-label="Learn" className="grid size-11 place-items-center text-muted"><BookOpen className="size-5" /></NavLink>
            <NavLink to="/ideas" aria-label="Ideas" className="grid size-11 place-items-center text-muted"><Lightbulb className="size-5" /></NavLink>
            <NavLink to="/boards" aria-label="Boards" className="grid size-11 place-items-center text-fg"><Bookmark className="size-5" /></NavLink>
          </div>
        </header>

        <main className={`min-h-0 min-w-0 flex-1 ${full ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          <Suspense fallback={<p className="p-6 text-sm text-muted">Opening…</p>}>
            <Routes>
              <Route path="/" element={<Studies />} />
              <Route path="/catalog" element={<Catalog />} />
              <Route path="/ideas" element={<Ideas />} />
              <Route path="/learn" element={<Learn />} />
              <Route path="/learn/:lessonId" element={<LessonPage />} />
              <Route path="/studio" element={<Studio />} />
              <Route path="/boards" element={<Boards />} />
              <Route path="/house" element={<House />} />
              <Route path="/house/:roomId" element={<Room />} />
              <Route path="/budget" element={<Budget />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/decisions" element={<Decisions />} />
              <Route path="/lot" element={<LotPage />} />
              <Route path="*" element={<Studies />} />
            </Routes>
          </Suspense>
        </main>

        <nav className="pb-safe no-print flex shrink-0 border-t border-line bg-bg md:hidden">
          {NAV.filter((n) => MOBILE.includes(n.to)).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] ${isActive ? 'text-oak' : 'text-muted'}`}>
              <n.icon className="size-5" />{n.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
