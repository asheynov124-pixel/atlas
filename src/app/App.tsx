import { useBookStore } from '@/state/bookStore';
import { Reader } from '@/reader/Reader';
import { Chrome } from './Chrome';
import { Specimen } from './Specimen';
import { useRoute } from './router';
import { useApplyTheme } from './useTheme';

export default function App() {
  const route = useRoute();
  const theme = useBookStore((s) => s.book.theme);
  useApplyTheme(theme);

  if (route.kind === 'specimen') return <Specimen />;
  if (route.kind === 'print') return <Specimen />;

  return (
    <>
      <Reader route={route} />
      <Chrome />
    </>
  );
}
