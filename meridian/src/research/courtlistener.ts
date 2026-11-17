/**
 * CourtListener (Free Law Project) adapter. Needs a free API token in
 * COURTLISTENER_TOKEN. Search returns opinions; import pulls the cluster metadata and
 * the html_with_citations text, keeping star pagination for pin cites.
 */
import { opinionHtmlToText } from './cites.js';
import { rankCourt } from './library.js';

export interface ClHit { id: string; opinion_id: number; cluster_id: number; name: string; citation: string | null; citations: string[]; court: string; date: string; snippet: string; url: string }

export class CourtListener {
  constructor(private token = process.env['COURTLISTENER_TOKEN'] ?? '', private base = 'https://www.courtlistener.com/api/rest/v4') {}

  get enabled(): boolean { return this.token.length > 0; }

  private async get(path: string): Promise<Record<string, unknown>> {
    if (!this.enabled) throw new Error('Set COURTLISTENER_TOKEN to search CourtListener (free account at courtlistener.com).');
    const r = await fetch(`${this.base}${path}`, { headers: { Authorization: `Token ${this.token}`, Accept: 'application/json' } });
    if (!r.ok) throw new Error(`CourtListener ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return (await r.json()) as Record<string, unknown>;
  }

  async search(q: string, opts: { courts?: string[]; limit?: number } = {}): Promise<ClHit[]> {
    const params = new URLSearchParams({ q, type: 'o', order_by: 'score desc' });
    if (opts.courts?.length) params.set('court', opts.courts.join(' '));
    const j = await this.get(`/search/?${params}`);
    const results = (j['results'] as Array<Record<string, unknown>>) ?? [];
    return results.slice(0, opts.limit ?? 10).map((r) => {
      const ops = (r['opinions'] as Array<Record<string, unknown>> | undefined) ?? [];
      const op = ops[0] ?? {};
      const cites = (r['citation'] as string[] | undefined) ?? [];
      return {
        id: `cl:${op['id'] ?? r['cluster_id']}`, opinion_id: Number(op['id'] ?? 0), cluster_id: Number(r['cluster_id']), name: String(r['caseName'] ?? ''),
        citation: cites.find((c) => /N\.J\./.test(c)) ?? cites[0] ?? null, citations: cites, court: String(r['court'] ?? ''), date: String(r['dateFiled'] ?? ''),
        snippet: String(op['snippet'] ?? '').replace(/<[^>]+>/g, ''), url: `https://www.courtlistener.com${r['absolute_url'] ?? ''}`,
      };
    });
  }

  async fetchOpinion(opinion_id: number): Promise<{ id: string; name: string; citation: string | null; citations: string[]; court: string; court_rank: number; date: string; text: string; url: string }> {
    const op = await this.get(`/opinions/${opinion_id}/?fields=id,cluster,html_with_citations,plain_text,absolute_url`);
    const clusterUrl = String(op['cluster'] ?? '');
    const clusterId = /clusters\/(\d+)/.exec(clusterUrl)?.[1];
    const cl = clusterId ? await this.get(`/clusters/${clusterId}/?fields=case_name,citations,date_filed,docket`) : {};
    const cites = ((cl['citations'] as Array<{ volume: number; reporter: string; page: string }> | undefined) ?? []).map((c) => `${c.volume} ${c.reporter} ${c.page}`);
    let court = '';
    if (cl['docket']) { try { const d = await this.get(`${String(cl['docket']).replace(/^.*\/api\/rest\/v4/, '')}?fields=court`); const c = await this.get(`${String(d['court']).replace(/^.*\/api\/rest\/v4/, '')}?fields=full_name`); court = String(c['full_name'] ?? ''); } catch { court = ''; } }
    const html = String(op['html_with_citations'] ?? '');
    const text = html ? opinionHtmlToText(html) : String(op['plain_text'] ?? '');
    return { id: `cl:${opinion_id}`, name: String(cl['case_name'] ?? `Opinion ${opinion_id}`), citation: cites.find((c) => /N\.J\./.test(c)) ?? cites[0] ?? null, citations: cites, court, court_rank: rankCourt(court), date: String(cl['date_filed'] ?? ''), text, url: `https://www.courtlistener.com${op['absolute_url'] ?? ''}` };
  }

  /** Later opinions that cite a given cluster (for the treatment scan). */
  async citing(cluster_id: number, limit = 20): Promise<ClHit[]> {
    return this.search(`cites:(${cluster_id})`, { limit });
  }
}
