import { lazy, Suspense } from 'react';
import { Book } from './reader/Book';
import { useNav } from './store/nav';
import { useApplyTheme } from './reader/theme';
import { PrintBook } from './reader/Print';

const Specimen = lazy(() => import('./reader/Specimen'));

export function App() {
  useApplyTheme();
  const route = useNav((s) => s.route);
  if (route.name === 'specimen') {
    return (
      <Suspense fallback={null}>
        <Specimen />
      </Suspense>
    );
  }
  return (
    <>
      <Book />
      <PrintBook />
    </>
  );
}
