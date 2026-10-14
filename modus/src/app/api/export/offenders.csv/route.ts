import { listOffenders } from '@/lib/queries';
export const dynamic = 'force-dynamic';
export async function GET() {
  const rows = await listOffenders();
  const head = ['slug', 'name', 'alias', 'legal_status', 'proven', 'attributed', 'first_year', 'last_year', 'caught_year', 'states', 'methods', 'victimology', 'how_caught', 'how_caught_text'];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const body = rows.map((o) => [o.slug, o.name, o.alias, o.legalStatus, o.proven, o.attributed, o.firstKillingYear, o.lastKillingYear, o.caughtYear, o.statesNote ?? o.states.join(' '), o.methods.join('; '), o.victimology, o.howCaught, o.howCaughtText].map(esc).join(','));
  return new Response([head.join(','), ...body].join('\n'), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="modus-offenders.csv"' } });
}
