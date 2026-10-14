'use client';
import { useEffect, useState } from 'react';
export function OfflineList() {
  const [cases, setCases] = useState<string[] | null>(null);
  useEffect(() => {
    if (!('serviceWorker' in navigator)) { setCases([]); return; }
    const onMsg = (e: MessageEvent) => { if (e.data?.cases) setCases(e.data.cases); };
    navigator.serviceWorker.addEventListener('message', onMsg);
    navigator.serviceWorker.ready.then((r) => r.active?.postMessage('list-cases'));
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, []);
  if (cases == null) return null;
  return (
    <div className="panel" style={{ marginTop: 28, padding: '20px 22px' }}>
      <div className="k" style={{ color: 'var(--ink)' }}>Saved on this device · {cases.length}</div>
      {cases.length ? cases.map((p) => <a key={p} href={p} className="linkrow" style={{ fontWeight: 600 }}>{decodeURIComponent(p.split('/')[2]).replace(/-/g, ' ')}</a>) : <p className="ne" style={{ marginTop: 10 }}>Nothing saved yet. Open a dossier while online and it will be kept here.</p>}
    </div>
  );
}
