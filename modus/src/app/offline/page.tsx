import Link from 'next/link';
import { OfflineList } from '@/components/OfflineList';
export default function Offline() {
  return (
    <main className="wrap" style={{ paddingTop: 64, paddingBottom: 96 }}>
      <div className="k" style={{ color: 'var(--ox)' }}>Offline</div>
      <h1 className="h1" style={{ fontSize: 56 }}>No connection</h1>
      <p className="lede">The last 25 dossiers you opened are kept on this device. <Link href="/">Try the index</Link> once you are back online.</p>
      <OfflineList />
    </main>
  );
}
