import { notFound } from 'next/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { getDossier } from '@/lib/queries';
import { CountSection } from '@/components/dossier/CountSection';
import { Documents } from '@/components/dossier/Documents';

export const dynamic = 'force-dynamic';

export default async function CountPage({ params }: { params: Promise<{ slug: string; label: string }> }) {
  const { slug, label } = await params;
  const d = await getDossier(slug);
  const c = d?.counts.find((x) => x.label.toLowerCase() === decodeURIComponent(label).toLowerCase());
  if (!d || !c) notFound();
  const i = d.counts.indexOf(c); const prev = d.counts[i - 1], next = d.counts[i + 1];
  return (
    <>
      <SiteHeader />
      <div className="subbar"><div className="wrap"><span className="k">On this file</span><a href={`/case/${slug}`}>{d.offender.name}</a><a href={`/case/${slug}#ledger`}>Ledger</a>{prev && <a href={`/case/${slug}/count/${prev.label}`}>← Count {prev.label}</a>}{next && <a href={`/case/${slug}/count/${next.label}`}>Count {next.label} →</a>}</div></div>
      <main className="wrap" style={{ paddingBottom: 96 }}>
        <CountSection d={d} c={c} standalone />
        <Documents docs={d.documents} reviewOpen={d.reviewOpen} />
      </main>
    </>
  );
}
